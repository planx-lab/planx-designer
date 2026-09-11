/* The scrollable records region must remain keyboard focusable. */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PREVIEW_BYTES, DEFAULT_PREVIEW_ROWS, MAX_PREVIEW_BYTES, MAX_PREVIEW_ROWS, previewSource } from '@/api/pluginPreview';
import type { PreviewProcessor, SourcePreviewResult } from '@/api/pluginPreview';
import { stringifyJson } from '@/lib/json';
import { ApiError } from '@/types/api';
import type { ComponentOperations } from '@/types/plugin';
import { hasInvalidConfigDraft, useConfigDraftGuard } from '@/hooks/useConfigDraftGuard';

type Result =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; value: SourcePreviewResult }
  | { status: 'error'; message: string; input?: boolean };

const INPUT = 'w-full bg-muted border border-border rounded-md h-8 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent';
const BUTTON = 'bg-accent hover:bg-accent/80 text-accent-foreground rounded-md text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

function previewError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 501: return 'Source preview unsupported by server (501).';
      case 422: return 'Preview redacted: sensitive schema fields prevented the entire result from being returned. Select safe fields explicitly.';
      case 413: return 'Preview budget exceeded. Adjust limits or selected fields.';
      case 504: return 'Source preview timed out (10-second bound).';
      case 408: return 'Source preview cancelled by server.';
      case 400: return 'Invalid source preview request. Check configuration and limits.';
      case 502: return 'Source preview failed; no data is shown.';
    }
  }
  return 'Source preview request failed; no data is shown.';
}

type SourcePreviewPanelProps = {
  tenantId: string; pluginId: string; componentId: string;
  config: Record<string, unknown>; operations?: ComponentOperations;
  processors?: PreviewProcessor[]; contextKey?: string; blockedReason?: string;
  onResult?: (value?: SourcePreviewResult) => void;
};

export function SourcePreviewPanel(props: SourcePreviewPanelProps) {
  const invalidDraft = useConfigDraftGuard();
  const scopeKey = stringifyJson([
    props.tenantId, props.pluginId, props.componentId, props.config,
    props.operations?.preview, props.processors, props.contextKey,
    props.blockedReason, invalidDraft,
  ]);
  return <ScopedSourcePreviewPanel key={scopeKey} {...props} invalidDraft={invalidDraft} />;
}

function ScopedSourcePreviewPanel({ tenantId, pluginId, componentId, config, operations, processors, blockedReason, onResult, invalidDraft }: SourcePreviewPanelProps & { invalidDraft: boolean }) {
  const [result, setResult] = useState<Result>({ status: 'idle' });
  const [rows, setRows] = useState(String(DEFAULT_PREVIEW_ROWS));
  const [bytes, setBytes] = useState(String(DEFAULT_PREVIEW_BYTES));
  const [specialOnly, setSpecialOnly] = useState(false);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const processed = processors !== undefined;
  const canPreview = operations?.preview === true;
  const hasTenant = !!tenantId?.trim();
  const loading = result.status === 'loading';
  const disabled = !canPreview || !hasTenant || loading || invalidDraft || !!blockedReason;
  const rowsId = (processed ? 'processed-' : '') + 'preview-rows-' + pluginId + '-' + componentId;
  const bytesId = (processed ? 'processed-' : '') + 'preview-bytes-' + pluginId + '-' + componentId;

  const cancelRequest = useCallback(() => {
    request.current++;
    controller.current?.abort();
    controller.current = null;
    clearTimeout(timeout.current);
    timeout.current = undefined;
  }, []);

  useEffect(() => {
    onResult?.();
    return cancelRequest;
  }, [cancelRequest, onResult]);

  const start = async () => {
    if (disabled || hasInvalidConfigDraft()) return;
    onResult?.();
    // Only bounded UI budgets become Number; opaque configuration never does.
    const maxRows = Number(rows);
    const maxBytes = Number(bytes);
    if (!/^\d+$/.test(rows) || !/^\d+$/.test(bytes) ||
      !Number.isInteger(maxRows) || maxRows < 1 || maxRows > MAX_PREVIEW_ROWS ||
      !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_PREVIEW_BYTES) {
      setResult({ status: 'error', message: 'Use whole-number limits: 1-100 rows and 1-1048576 bytes.', input: true });
      return;
    }
    const current = ++request.current;
    const active = new AbortController();
    controller.current = active;
    setResult({ status: 'loading' });
    timeout.current = setTimeout(() => {
      if (request.current !== current) return;
      request.current++;
      active.abort();
      controller.current = null;
      setResult({ status: 'error', message: `${processed ? 'Processed' : 'Source'} preview timed out (10-second bound).` });
    }, 10000);
    try {
      const value = await previewSource(pluginId, componentId, config, tenantId, { maxRows, maxBytes }, active.signal, processors);
      if (request.current !== current) return;
      if (!value?.batch || !Array.isArray(value.batch.schema?.fields) ||
        !Array.isArray(value.batch.records) || value.batch.records.length > maxRows || typeof value.truncated !== 'boolean' ||
        (processed ? value.scope !== 'processed' || !Number.isInteger(value.inputRows) || value.inputRows! < 0 || value.inputRows! > maxRows || value.processorCount !== processors.length : value.scope !== undefined)) {
        setResult({ status: 'error', message: processed ? 'Unrecognized processed preview response; no data is shown.' : 'Unrecognized preview response; no data is shown.' });
        return;
      }
      setResult({ status: 'success', value });
      onResult?.(value);
    } catch (error) {
      if (request.current === current) setResult({ status: 'error', message: processed ? previewError(error).replaceAll('Source preview', 'Processed preview').replaceAll('source preview', 'processed preview') : previewError(error) });
    } finally {
      if (request.current === current) { controller.current = null; clearTimeout(timeout.current); }
    }
  };

  const cancel = () => {
    request.current++;
    controller.current?.abort();
    controller.current = null;
    clearTimeout(timeout.current);
    onResult?.();
    setResult({ status: 'error', message: 'Preview cancelled. No execution or ACK was requested.' });
  };

  const value = result.status === 'success' && !invalidDraft && !blockedReason ? result.value : undefined;
  const records = value?.batch.records.map((record, index) => ({ record, index }))
    .filter(({ record }) => !specialOnly || value.batch.schema.fields.some((field) => {
      const cell = Object.hasOwn(record, field.name) ? record[field.name] : undefined;
      return !cell?.present || cell.null || cell.data === '';
    })) ?? [];
  return (
    <section aria-label={processed ? 'Processed data preview' : 'Source data preview'} className="mt-4 border-t border-border pt-3 space-y-2">
      <h4 className="text-xs font-medium text-foreground/80">{processed ? 'Processed data preview · 处理后样本' : 'Source data preview'}</h4>
      <p className="text-[11px] text-foreground/40">{processed ? '显式安全来源采样后，按实际顺序调用 builtin 处理组件与 Lookup Runtime。10 秒有界；不创建持久执行，不写目标，不确认来源 ACK 或保存 checkpoint。样本不能证明完整流程或交付。' : 'Explicit read-only hook, bounded to 10 seconds. No pipeline execution, source ACK, checkpoint save or target write is requested.'}</p>
      {blockedReason && <p className="text-[11px] text-warning">{blockedReason}</p>}
      {invalidDraft && <p className="text-[11px] text-warning">请先修正未应用的配置草稿，再读取样本。</p>}
      {!hasTenant && <p className="text-[11px] text-warning">Tenant context is required for source preview.</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-foreground/60" htmlFor={rowsId}>Maximum preview rows
          <input id={rowsId} type="number" min={1} max={MAX_PREVIEW_ROWS} step={1} className={INPUT} value={rows} disabled={disabled}
            aria-invalid={result.status === 'error' && result.input === true}
            onChange={(event) => { setRows(event.target.value); setResult({ status: 'idle' }); onResult?.(); }} />
        </label>
        <label className="text-[11px] text-foreground/60" htmlFor={bytesId}>Maximum preview bytes
          <input id={bytesId} type="number" min={1} max={MAX_PREVIEW_BYTES} step={1} className={INPUT} value={bytes} disabled={disabled}
            aria-invalid={result.status === 'error' && result.input === true}
            onChange={(event) => { setBytes(event.target.value); setResult({ status: 'idle' }); onResult?.(); }} />
        </label>
      </div>
      <p className="text-[11px] text-foreground/40">The byte budget covers the complete compact response JSON, including schema. It is not a process-memory bound.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} disabled={disabled} onClick={() => void start()}>{loading ? 'Loading preview...' : processed ? 'Preview processed data' : 'Preview source data'}</button>
        {loading && <button type="button" className={BUTTON} onClick={cancel}>Cancel preview</button>}
      </div>
      {!canPreview && <p className="text-[11px] text-foreground/40">{operations?.preview === false ? 'Source preview unsupported by this component.' : 'Source preview unavailable (not advertised).'}</p>}
      {result.status === 'error' && <p role="alert" className="text-[11px] text-warning break-words">{result.message}</p>}
      {value && <>
        <p className="text-xs text-foreground/80">{value.batch.records.length} preview {value.batch.records.length === 1 ? 'record' : 'records'}</p>
        {processed && <p className="text-xs text-foreground/80">{value.inputRows} input rows · {value.batch.records.length} output rows · {value.processorCount} processors</p>}
        <p className="text-[11px] text-warning">{value.truncated ? 'Truncated: limits may have stopped reading; additional rows are not guaranteed.' : processed ? 'Not truncated (reported for this bounded processed sample).' : 'Not truncated (reported by source).'}</p>
        <label className="typed-preview-filter">
          <input type="checkbox" checked={specialOnly} onChange={(event) => setSpecialOnly(event.target.checked)} />
          只看未提供、NULL 或空字符串
        </label>
        <div className="typed-preview-scroll" data-evidence-scroll tabIndex={0} role="region" aria-label={processed ? '处理后 Typed Records 表格，可横向滚动' : '来源 Typed Records 表格，可横向滚动'}>
          <table className="typed-preview-table">
            <caption className="sr-only">{processed ? '实际处理后样本，data 与输出 Schema 原样展示，不推断精度。' : '来源样本，data 原样展示，不执行转换或推断精度。'}</caption>
            <thead><tr><th scope="col">行</th>{value.batch.schema.fields.map((field) => (
              <th scope="col" key={field.name}>
                <span>{field.name}</span><small>{field.kind} · {field.nullable ? 'nullable' : 'not null'}</small>
                {field.kind === 'decimal' && <small>precision {field.precision ?? '?'} / scale {field.scale ?? '?'}</small>}
                {(field.kind === 'datetime' || field.kind === 'timestamp') && <small>timePrecision {field.timePrecision ?? 'unknown'}</small>}
              </th>
            ))}</tr></thead>
            <tbody>{records.map(({ record, index }) => (
              <tr key={index}><th scope="row">{index + 1}</th>{value.batch.schema.fields.map((field) => {
                const cell = Object.hasOwn(record, field.name) ? record[field.name] : undefined;
                const special = !cell?.present || cell.null || cell.data === '' || cell.data === undefined;
                const text = !cell?.present ? '未提供' : cell.null ? 'NULL' : cell.data === '' ? '空字符串'
                  : cell.data === undefined ? '缺少 data' : typeof cell.data === 'string' ? cell.data : stringifyJson(cell.data);
                return <td key={field.name}><span className={special ? 'typed-preview-special' : 'font-mono'}>{text}</span></td>;
              })}</tr>
            ))}</tbody>
          </table>
          {records.length === 0 && <p className="p-4 text-sm text-foreground-muted">{specialOnly ? '当前样本没有符合筛选条件的记录。' : processed ? '当前有界样本处理后为 0 行；可能被规则过滤，不能据此断言完整来源为空。实际输出字段结构仍保留。' : '来源返回了空样本；字段结构仍显示在表头。'}</p>}
        </div>
        <p className="text-[11px] text-foreground/40">Missing is not NULL; an empty string is present. Typed cells retain kind/present/null/data. Integers, decimal coefficients and temporal text are not reformatted.</p>
        <p className="text-[11px] text-foreground/40">Temporal timePrecision (0-9) is reported metadata: omitted means unknown; 0 means whole seconds. Decimal precision/scale are separate. No precision is inferred and no time value is rounded.</p>
        <details className="typed-preview-raw"><summary>查看原始 Schema 与 Typed Records</summary>
        <p className="text-[11px] text-foreground/60">record.Schema (from this preview, not legacy Discover)</p>
        <pre aria-label={processed ? 'Processed preview record.Schema' : 'Preview record.Schema'} className="max-h-48 overflow-auto rounded-md border border-border bg-muted p-2 text-[11px] font-mono text-foreground/80">{stringifyJson(value.batch.schema, 2)}</pre>
        <p className="text-[11px] text-foreground/60">Typed records</p>
        <pre aria-label={processed ? 'Processed typed preview records' : 'Typed preview records'} className="max-h-80 overflow-auto rounded-md border border-border bg-muted p-2 text-[11px] font-mono text-foreground/80">{stringifyJson(value.batch.records, 2)}</pre>
        </details>
      </>}
    </section>
  );
}

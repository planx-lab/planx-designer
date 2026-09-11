/* Editor identity and sessionStorage are external contexts synchronized here. */
/* eslint-disable react-hooks/set-state-in-effect */
import { confirmRun } from './RunConfirmation';
import { confirmDiscardDraft } from './DiscardConfirmation';
import { useState, useRef, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Undo2,
  Redo2,
  ExternalLink,
  FilePlus2,
  Save,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { submitPipeline, runPipeline, updatePipeline, getExecution, getExecutionByRequest } from '@/api/controlPlane';
import type { ExecutionStatus } from '@/api/controlPlane';
import { connectionRuntimeRevisions, getConnections } from '@/api/connections';
import { ApiError } from '@/types/api';
import { stringifyJson } from '@/lib/json';
import { clearDraft } from '@/lib/draft';

type PendingRun = {
  requestId: string; expectedRevision: string; pipelineId: string; tenantId: string;
  // Older pending handles remain queryable; this map is never replayed.
  expectedConnections?: Readonly<Record<string, string>>;
};
function pendingKey(tenantId: string, pipelineId: string): string {
  return `planx:pending-run:${encodeURIComponent(tenantId)}:${encodeURIComponent(pipelineId)}`;
}
function readPendingRun(tenantId: string, pipelineId: string): PendingRun | null {
  const raw = sessionStorage.getItem(pendingKey(tenantId, pipelineId));
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<PendingRun>;
  if (value.tenantId !== tenantId || value.pipelineId !== pipelineId ||
      typeof value.requestId !== 'string' || !value.requestId ||
      typeof value.expectedRevision !== 'string' || !value.expectedRevision) {
    throw new Error('本次提交记录无法读取；请先核对执行记录，不要重新运行。');
  }
  return value as PendingRun;
}

export function PipelineToolbar() {
  const navigate = useNavigate();
  const name = usePipelineStore((s) => s.name);
  const setName = usePipelineStore((s) => s.setName);
  const tenantId = usePipelineStore((s) => s.tenantId);
  const buildSpec = usePipelineStore((s) => s.buildSpec);
  const validate = usePipelineStore((s) => s.validate);
  const nodes = usePipelineStore((s) => s.nodes);
  usePipelineStore((s) => s.edges);
  const pipelineId = usePipelineStore((s) => s.pipelineId);
  const pipelineRevision = usePipelineStore((s) => s.pipelineRevision);
  const savedFingerprint = usePipelineStore((s) => s.savedFingerprint);
  const editorId = usePipelineStore((s) => s.editorId);
  const reset = usePipelineStore((s) => s.reset);

  const undo = usePipelineStore((s) => s.undo);
  const redo = usePipelineStore((s) => s.redo);
  const _past = usePipelineStore((s) => s._past);
  const _future = usePipelineStore((s) => s._future);
  const showPreview = useUIStore((s) => s.showPreview);
  const togglePreview = useUIStore((s) => s.togglePreview);
  const submitStatus = useUIStore((s) => s.submitStatus);
  const submitResult = useUIStore((s) => s.submitResult);
  const setSubmitStatus = useUIStore((s) => s.setSubmitStatus);
  const saveStatus = useUIStore((s) => s.saveStatus);
  const setSaveStatus = useUIStore((s) => s.setSaveStatus);
  const saveError = useUIStore((s) => s.saveError);
  const validationErrors = useUIStore((s) => s.validationErrors);

  const [validating, setValidating] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [preparingRun, setPreparingRun] = useState(false);
  const actionRef = useRef(false);
  const mounted = useRef(false);
  const observation = useRef(0);
  const fingerprint = stringifyJson(buildSpec());
  const dirty = fingerprint !== savedFingerprint;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      observation.current += 1;
      if (pollingRef.current !== null) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, []);

  useEffect(() => {
    observation.current += 1;
    if (pollingRef.current !== null) clearInterval(pollingRef.current);
    pollingRef.current = null;
    setPolling(false);
    setExecutionStatus(null);
    setPollError(null);
    setSubmitStatus('idle');
  }, [editorId, tenantId, setSubmitStatus]);

  useEffect(() => {
    try {
      setPendingRun(pipelineId ? readPendingRun(tenantId, pipelineId) : null);
      setStorageError(null);
    } catch (err) {
      setStorageError(err instanceof Error ? err.message : '无法读取本次提交记录');
    }
  }, [tenantId, pipelineId, editorId]);

  const currentEditor = (id: number) => mounted.current && usePipelineStore.getState().editorId === id;

  const observeExecution = (response: ExecutionStatus, owner: number, runTenant: string) => {
    if (!currentEditor(owner)) return;
    const generation = ++observation.current;
    if (pollingRef.current !== null) clearInterval(pollingRef.current);
    pollingRef.current = null;
    setPollError(null);
    setExecutionStatus(response);
    if (response.status === 'succeeded' || response.status === 'failed') {
      setPolling(false);
      setSubmitStatus(response.status === 'succeeded' ? 'success' : 'error', {
        executionId: response.executionId, pipelineId: response.pipelineId,
      });
      return;
    }
    setSubmitStatus('submitting', { executionId: response.executionId, pipelineId: response.pipelineId });
    setPolling(true);
    let inFlight = false;
    pollingRef.current = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const updated = await getExecution(response.executionId, runTenant);
        if (!currentEditor(owner) || observation.current !== generation) return;
        setExecutionStatus(updated);
        setPollError(null);
        if (updated.status === 'succeeded' || updated.status === 'failed') {
          if (pollingRef.current !== null) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setPolling(false);
          setSubmitStatus(updated.status === 'succeeded' ? 'success' : 'error', {
            executionId: updated.executionId, pipelineId: updated.pipelineId,
            ...(updated.status === 'failed' ? { error: updated.errorMessage ?? 'Execution failed' } : {}),
          });
        }
      } catch {
        if (currentEditor(owner) && observation.current === generation) {
          setPollError('Execution status unavailable. Retrying...');
        }
      } finally { inFlight = false; }
    }, 1500);
  };

  const finishPending = (intent: PendingRun) => {
    sessionStorage.removeItem(pendingKey(intent.tenantId, intent.pipelineId));
    setPendingRun(null);
  };

  const handleValidate = () => {
    setValidating(true);
    const result = validate();
    setTimeout(() => {
      useUIStore.getState().setValidationErrors(result.errors);
      if (!result.valid) {
        useUIStore.getState().selectNode(null); // deselect to show errors
      }
      setValidating(false);
    }, 100);
  };

  const handleSubmit = async () => {
    if (actionRef.current || pollingRef.current !== null) return;
    const state = usePipelineStore.getState();
    if (!state.pipelineId || !state.pipelineRevision || stringifyJson(state.buildSpec()) !== state.savedFingerprint || !state.validate().valid) return;
    const owner = state.editorId;
    const sameOwner = () => currentEditor(owner) && usePipelineStore.getState().tenantId === state.tenantId;
    const sameSavedIntent = () => {
      const latest = usePipelineStore.getState();
      return sameOwner() && latest.pipelineId === state.pipelineId && latest.pipelineRevision === state.pipelineRevision
        && stringifyJson(latest.buildSpec()) === state.savedFingerprint && latest.validate().valid;
    };
    actionRef.current = true;
    let intent: PendingRun | null = null;
    try {
      const prior = readPendingRun(state.tenantId, state.pipelineId);
      if (prior) { setPendingRun(prior); return; }
      setPreparingRun(true);
      const resources = await getConnections(state.tenantId);
      if (!sameSavedIntent()) {
        if (sameOwner()) setSubmitStatus('error', { error: '读取连接版本期间任务已变化；请保存并重新确认。未发送运行请求。' });
        return;
      }
      const expectedConnections = Object.freeze(connectionRuntimeRevisions(resources));
      setPreparingRun(false);
      const warning = `将运行已保存并确认的任务版本，Save 本身不会运行。\n\n工作空间：${state.tenantId}\n已捕获 ${resources.length} 项租户连接版本；Engine 只使用任务实际引用的资源，确认后不会自动替换连接版本。\n目标节点：${state.nodes.filter(node => node.data.nodeType === 'sink').map(node => node.data.name).join(', ')}\n\n来源会被读取，目标可能产生真实写入。目标提交与来源确认分别报告；失败不保证没有写入。确认开始新的运行？`;
      if (!(await confirmRun(warning))) return;
      if (!sameSavedIntent() || document.querySelector('[data-config-invalid="true"]')) {
        if (sameOwner()) setSubmitStatus('error', { error: '确认期间任务已变化；请保存并重新确认。未发送运行请求。' });
        return;
      }
      setActionBusy(true);
      intent = {
        pipelineId: state.pipelineId, tenantId: state.tenantId, expectedRevision: state.pipelineRevision,
        expectedConnections, requestId: crypto.randomUUID(),
      };
      // Only non-secret intent metadata is persisted, before the POST. A
      // storage failure aborts admission rather than losing the recovery handle.
      sessionStorage.setItem(pendingKey(intent.tenantId, intent.pipelineId), JSON.stringify(intent));
      setPendingRun(intent);
      setExecutionStatus(null);
      setPollError(null);
      setSubmitStatus('submitting');
      useUIStore.getState().setValidationErrors([]);
      const response = await runPipeline(intent.pipelineId, intent.tenantId, intent.expectedRevision, intent.requestId, expectedConnections);
      if (response.pipelineId !== intent.pipelineId || !response.executionId) throw new Error('运行响应与本次提交不匹配');
      // The backend owns the run even if the editor changed while awaiting it.
      sessionStorage.removeItem(pendingKey(intent.tenantId, intent.pipelineId));
      if (currentEditor(owner)) {
        setPendingRun(null);
        observeExecution(response, owner, intent.tenantId);
      }
    } catch (err) {
      if (!sameOwner()) return;
      if (!intent) {
        setSubmitStatus('error', { error: '运行准备未完成，本次没有发送新的运行请求。请先核对连接版本和已有提交记录。' });
        return;
      }
      // Definite pre-admission errors permit correction. A network error,
      // conflict or 5xx remains uncertain and retains the exact request handle.
      if (intent && err instanceof ApiError && [400, 404, 412, 429].includes(err.status)) {
        try { finishPending(intent); } catch { /* Keep the pending handle visible. */ }
      }
      setSubmitStatus('error', {
        error: `Submission could not be confirmed: ${err instanceof Error ? err.message : 'request failed'}. 请查询本次提交，不要重复运行。`,
      });
    } finally {
      actionRef.current = false;
      if (mounted.current) { setActionBusy(false); setPreparingRun(false); }
    }
  };

  const handleQuerySubmission = async () => {
    if (!pendingRun || actionRef.current) return;
    const owner = editorId;
    const intent = pendingRun;
    actionRef.current = true;
    setActionBusy(true);
    try {
      const response = await getExecutionByRequest(intent.requestId, intent.tenantId);
      if (response.pipelineId !== intent.pipelineId ||
          (response.definition && response.definition.revision !== intent.expectedRevision)) {
        throw new Error('本次提交的任务版本不匹配；请核对执行记录');
      }
      if (!currentEditor(owner)) return;
      finishPending(intent);
      observeExecution(response, owner, intent.tenantId);
    } catch (err) {
      if (currentEditor(owner)) setSubmitStatus('error', {
        error: `尚无法确认本次提交；未查到结果不代表没有执行，不会自动重跑。 ${err instanceof Error ? err.message : ''}`,
      });
    } finally {
      actionRef.current = false;
      if (mounted.current) setActionBusy(false);
    }
  };

  const runValidation = validate();
  const runProblems = [
    ...runValidation.errors,
    ...(!pipelineId || !pipelineRevision ? ['请先保存草稿，再确认运行。'] : dirty ? ['修改尚未保存，请先 Save。'] : []),
  ];
  const canSubmit = runProblems.length === 0 && !pendingRun && !storageError;
  // ADR-016: multi-Sink fan-out. When ≥2 sinks exist, every batch is broadcast
  // to all sinks; on a sink failure, replay re-delivers to already-succeeded
  // sinks. Sinks must be idempotent — surface this as a non-blocking warning.
  const sinkCount = nodes.filter((n) => n.data.nodeType === 'sink').length;

  // Start a brand-new pipeline: clear any saved draft + the in-memory graph so
  // the user gets a fresh canvas (not a stale draft from a previous session).
  // Confirms first if there's unsaved work in progress.
  const handleNew = async () => {
    if (actionRef.current) return;
    if (nodes.length > 0 && !(await confirmDiscardDraft(tenantId))) {
      return;
    }
    clearDraft();
    reset(tenantId);
    useUIStore.getState().setValidationErrors([]);
    useUIStore.getState().setSubmitStatus('idle');
    useUIStore.getState().setSaveStatus('idle');
  };

  // New and existing drafts share the same non-executing save action.
  const handleSave = async () => {
    if (actionRef.current || pollingRef.current !== null) return;
    if (document.querySelector('[data-config-invalid="true"]')) {
      setSaveStatus('error', '存在尚未应用的无效输入；请先修正，避免保存旧值。');
      return;
    }
    const state = usePipelineStore.getState();
    const owner = state.editorId;
    const spec = state.buildSpec();
    const submitted = stringifyJson(spec);
    actionRef.current = true;
    setActionBusy(true);
    setSaveStatus('saving');
    try {
      const response = state.pipelineId
        ? await updatePipeline(state.pipelineId, state.tenantId, state.name, spec, state.pipelineRevision ?? '')
        : await submitPipeline(spec, state.tenantId);
      if (!response.pipelineId || !response.revision) throw new Error('保存响应缺少任务标识或版本；请从任务列表核对。');
      if (currentEditor(owner) && state.acceptSaved(owner, state.tenantId, response.pipelineId, response.revision, submitted)) {
        if (stringifyJson(usePipelineStore.getState().buildSpec()) === submitted) clearDraft();
        setSaveStatus('saved');
        setSubmitStatus('idle');
      }
    } catch (err) {
      if (currentEditor(owner)) setSaveStatus('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      actionRef.current = false;
      if (mounted.current) setActionBusy(false);
    }
  };

  return (
    <>
    <header className="pipeline-toolbar min-h-14 shrink-0 border-b border-border bg-surface flex flex-wrap items-center px-4 py-2 gap-3">
      {preparingRun && <span role="status" className="text-xs text-foreground/60">正在读取连接版本...</span>}
      <button
        onClick={handleNew}
        disabled={actionBusy}
        title="New pipeline"
        aria-label="Start a new pipeline"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <FilePlus2 size={14} aria-hidden />
        New
      </button>
      {/* Pipeline name */}
      <label className="flex items-center gap-2 text-xs text-foreground-muted">
        任务名称
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Pipeline name…"
        className="bg-transparent text-sm font-medium text-foreground placeholder:text-foreground/30 focus:outline-none w-48"
      />
      </label>

      <div className="flex-1" />

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={_past.length === 0}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className="p-1.5 rounded-lg text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Undo2 size={16} />
      </button>
      <button
        onClick={redo}
        disabled={_future.length === 0}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        className="p-1.5 rounded-lg text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Redo2 size={16} />
      </button>

      {/* Validate */}
      <button
        onClick={handleValidate}
        disabled={validating}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-50"
      >
        {validating ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <AlertCircle size={14} />
        )}
        Validate
      </button>

      {/* Preview toggle */}
      <button
        onClick={togglePreview}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          showPreview
            ? 'bg-accent/20 text-accent'
            : 'text-foreground/60 hover:text-foreground hover:bg-surface-hover'
        }`}
      >
        {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
        配置文件
      </button>

      {/* Save is available for incomplete NEW and existing drafts. */}
      <button
        onClick={handleSave}
        disabled={actionBusy || polling || !tenantId}
        title="仅保存草稿，不读取来源，也不写入目标"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${saveStatus === 'error' ? 'bg-destructive/20 text-destructive' : 'bg-surface-hover text-foreground'} disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      >
        {saveStatus === 'saving' ? <Loader2 size={14} className="animate-spin" /> : saveStatus === 'saved' && !dirty ? <CheckCircle2 size={14} /> : <Save size={14} />}
        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : saveStatus === 'saved' && !dirty ? 'Saved' : 'Save'}
      </button>

      {/* Submit */}
      <button
        onClick={submitStatus === 'error' ? () => navigate('/executions') : handleSubmit}
        disabled={(submitStatus !== 'error' && !canSubmit) || actionBusy || submitStatus === 'submitting' || polling}
        title={!canSubmit ? runProblems.join(' ') : undefined}
        aria-describedby={!canSubmit ? 'run-structural-issues' : undefined}
        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          submitStatus === 'success'
            ? 'bg-accent/20 text-accent'
            : submitStatus === 'error'
              ? 'bg-destructive/20 text-destructive'
              : 'bg-accent text-background hover:bg-accent/90'
        } disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      >
        {submitStatus === 'submitting' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : submitStatus === 'success' ? (
          <CheckCircle2 size={14} />
        ) : submitStatus === 'error' ? (
          <XCircle size={14} />
        ) : (
          <Play size={14} />
        )}
        {submitStatus === 'submitting'
          ? '运行中…'
          : submitStatus === 'success'
            ? '再次运行前确认'
            : submitStatus === 'error'
              ? '先核对执行记录'
              : '运行前确认'}
      </button>

      {/* Execution status indicator */}
      {executionStatus && (
        <div
          className={`flex items-start gap-1.5 text-xs max-w-md ${
            executionStatus.status === 'failed'
              ? 'text-destructive'
              : executionStatus.status === 'succeeded'
                ? 'text-accent'
                : 'text-warning'
          } ${executionStatus.status === 'failed' ? 'whitespace-normal break-words' : 'whitespace-nowrap'}`}
        >
          {(executionStatus.status === 'pending' || executionStatus.status === 'running') && (
            <Loader2 size={14} className="animate-spin shrink-0" />
          )}
          {executionStatus.status === 'succeeded' && (
            <CheckCircle2 size={14} className="shrink-0" />
          )}
          {executionStatus.status === 'failed' && (
            <AlertCircle size={14} className="shrink-0" />
          )}
          <span>
            {pollError
              ? `Last reported: ${executionStatus.status}`
              : executionStatus.status === 'pending' || executionStatus.status === 'running'
              ? 'Running...'
              : executionStatus.status === 'succeeded'
                ? 'Succeeded'
                : `Failed${executionStatus.errorMessage ? ': ' + executionStatus.errorMessage : ''}`}
          </span>
          {/* Deep-link to the execution in the Operate view (unified-ui-design.md
              §4.3: bridge Build -> Operate after submit). */}
          {executionStatus.executionId && (
            <button
              type="button"
              onClick={() => navigate('/executions')}
              className="flex items-center gap-0.5 text-foreground/50 hover:text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded"
              title="Open this run in Executions"
              aria-label="Open execution in Executions view"
            >
              View
              <ExternalLink size={11} aria-hidden />
            </button>
          )}
        </div>
      )}

      {/* Per-node status badges */}
      {executionStatus?.nodeStatuses && Object.keys(executionStatus.nodeStatuses).length > 0 && (
        <div className="flex flex-wrap gap-1.5 ml-2">
          {Object.entries(executionStatus.nodeStatuses).map(([nodeId, ns]) => (
            <div
              key={nodeId}
              className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                ns.status === 'running'
                  ? 'bg-warning/10 border-warning/30 text-warning'
                  : ns.status === 'completed'
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
              }`}
            >
              {ns.status === 'completed' && <CheckCircle2 size={10} />}
              {ns.status === 'failed' && <XCircle size={10} />}
              {ns.status === 'running' && <Loader2 size={10} className="animate-spin" />}
              <span className="truncate max-w-[80px]">{nodeId}</span>
            </div>
          ))}
        </div>
      )}
    </header>
      <div className="pipeline-action-boundary">
        {pipelineId ? 'Save 仅保存草稿；运行绑定已保存版本。修改后必须重新保存并确认。' : '新建任务：Save 保存到 Engine，不创建执行。配置未完成也可以保存。'}
      </div>
      {runProblems.length > 0 && <p id="run-structural-issues" role="status" className="pipeline-action-boundary text-warning">运行前请完善：{runProblems.join(' ')}</p>}
      {pendingRun && <div role="status" className="pipeline-action-boundary text-warning flex items-center gap-3">
        本次提交尚待确认，不会自动重跑。
        <button type="button" disabled={actionBusy} onClick={handleQuerySubmission} className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">查询本次提交</button>
      </div>}
      {(saveError || storageError) && <div role="alert" className="pipeline-action-boundary text-destructive break-words">{saveError || storageError}</div>}
      {pollError && (
        <div role="status" className="shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
          {pollError}
        </div>
      )}
      {submitStatus === 'error' && !executionStatus && submitResult?.error && (
        <div role="alert" className="shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
          {submitResult.error}
        </div>
      )}
      {/* Replay safety requires business-level reconciliation, not BatchID alone. */}
      {sinkCount >= 2 && (
        <div className="shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-1.5 flex items-center gap-2">
          <AlertCircle size={13} className="text-warning shrink-0" aria-hidden />
          <span className="text-xs text-warning/90">
            Multi-Sink fan-out: every batch is sent to all {sinkCount} sinks. Before replay, reconcile prior commits or verify an idempotent whole path; BatchID alone is not sufficient.
          </span>
        </div>
      )}
      {/* Validation errors — shown when Validate finds problems or Submit is
          blocked by an invalid spec. Without this the errors were set in the
          store but never rendered, so Submit silently did nothing. */}
      {validationErrors.length > 0 && (
        <div className="shrink-0 max-h-40 overflow-y-auto border-b border-destructive/30 bg-destructive/10 px-4 py-2 flex flex-col gap-1">
          <span className="flex items-center gap-1 text-xs font-semibold text-destructive shrink-0">
            <AlertCircle size={13} aria-hidden />
            {validationErrors.length === 1 ? '1 issue' : `${validationErrors.length} issues`}
          </span>
          {validationErrors.map((err, i) => (
            <span key={i} className="text-xs text-destructive/90 break-words whitespace-normal">
              {err}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

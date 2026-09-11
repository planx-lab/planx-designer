import { useCallback, useEffect, useRef, useState } from 'react';
import { checkCompatibility, testConnection } from '@/api/pluginOperations';
import type { CompatibilityResult, ConnectionTestResult } from '@/api/pluginOperations';
import { parseJson, stringifyJson } from '@/lib/json';
import { ApiError } from '@/types/api';
import type { ComponentOperations } from '@/types/plugin';
import type { RecordSchema } from '@/types/record';
import { hasInvalidConfigDraft, useConfigDraftGuard } from '@/hooks/useConfigDraftGuard';

type Result<T> =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; value: T }
  | { status: 'error'; message: string; input?: boolean };

const BUTTON = 'bg-accent hover:bg-accent/80 text-accent-foreground rounded-md text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

function operationError(label: string, error: unknown): string {
  if (error instanceof ApiError && error.status === 501) return `${label} unsupported by server (501).`;
  return `${label} failed: ${error instanceof Error ? error.message : 'Request failed'}`;
}

type PluginOperationsPanelProps = {
  tenantId: string;
  pluginId: string;
  componentId: string;
  config: Record<string, unknown>;
  operations?: ComponentOperations;
  inputEvidence?: { key: string; schema?: RecordSchema; scope?: 'source' | 'processed'; message?: string };
  compatibilityOnly?: boolean;
  showCompatibility?: boolean;
};

export function PluginOperationsPanel(props: PluginOperationsPanelProps) {
  const invalidDraft = useConfigDraftGuard();
  const scopeKey = stringifyJson([
    props.tenantId, props.pluginId, props.componentId, props.config,
    props.operations?.testConnection, props.operations?.checkCompatibility,
    props.inputEvidence?.key, props.inputEvidence?.schema, invalidDraft,
  ]);
  return <ScopedPluginOperationsPanel key={scopeKey} {...props} invalidDraft={invalidDraft} />;
}

function ScopedPluginOperationsPanel({ tenantId, pluginId, componentId, config, operations, inputEvidence, compatibilityOnly = false, showCompatibility = true, invalidDraft }: PluginOperationsPanelProps & { invalidDraft: boolean }) {
  const [connection, setConnection] = useState<Result<ConnectionTestResult>>({ status: 'idle' });
  const [compatibility, setCompatibility] = useState<Result<CompatibilityResult>>({ status: 'idle' });
  const [schemaText, setSchemaText] = useState('');
  const connectionRequest = useRef(0);
  const compatibilityRequest = useRef(0);
  const compatibilityController = useRef<AbortController | null>(null);
  const compatibilityTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const canTest = operations?.testConnection === true;
  const canCheck = operations?.checkCompatibility === true;
  const hasTenant = !!tenantId?.trim();
  const schemaId = `input-schema-${pluginId}-${componentId}`;

  const cancelRequests = useCallback(() => {
    connectionRequest.current++;
    compatibilityRequest.current++;
    compatibilityController.current?.abort();
    compatibilityController.current = null;
    clearTimeout(compatibilityTimeout.current);
    compatibilityTimeout.current = undefined;
  }, []);

  useEffect(() => cancelRequests, [cancelRequests]);

  const probe = async () => {
    if (!hasTenant || !canTest || connection.status === 'loading') return;
    const request = ++connectionRequest.current;
    setConnection({ status: 'loading' });
    try {
      const value = await testConnection(pluginId, componentId, config, tenantId);
      if (request === connectionRequest.current) setConnection({ status: 'success', value });
    } catch (error) {
      if (request === connectionRequest.current) setConnection({ status: 'error', message: operationError('Connection test', error) });
    }
  };

  const precheck = async () => {
    if (!hasTenant || !canCheck || compatibility.status === 'loading' || hasInvalidConfigDraft() || (inputEvidence && !inputEvidence.schema)) return;
    const request = ++compatibilityRequest.current;
    let inputSchema: RecordSchema;
    try {
      const value = inputEvidence ? inputEvidence.schema : parseJson(schemaText);
      if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as Record<string, unknown>).fields)) throw new Error('Invalid schema shape');
      inputSchema = value as RecordSchema;
    } catch {
      setCompatibility({ status: 'error', input: true, message: 'Input schema must be a JSON object with a fields array.' });
      return;
    }
    setCompatibility({ status: 'loading' });
    const active = new AbortController();
    compatibilityController.current = active;
    compatibilityTimeout.current = setTimeout(() => {
      if (request !== compatibilityRequest.current) return;
      compatibilityRequest.current++;
      active.abort();
      setCompatibility({ status: 'error', message: 'Compatibility check timed out (10-second bound); no compatibility conclusion.' });
    }, 10000);
    try {
      const value = await checkCompatibility(pluginId, componentId, config, inputSchema, tenantId, active.signal);
      if (!value || typeof value.compatible !== 'boolean' || value.scope !== 'static_schema' || value.runtimeValidationRequired !== true) {
        throw new Error('Unrecognized compatibility response; no compatibility conclusion.');
      }
      if (request === compatibilityRequest.current) setCompatibility({ status: 'success', value });
    } catch (error) {
      if (request === compatibilityRequest.current) setCompatibility({ status: 'error', message: inputEvidence ? 'Compatibility check failed; no compatibility conclusion.' : operationError('Compatibility check', error) });
    } finally {
      if (request === compatibilityRequest.current) { compatibilityController.current = null; clearTimeout(compatibilityTimeout.current); }
    }
  };

  return (
    <section aria-label="Component operations" className="mt-4 border-t border-border pt-3 space-y-3">
      {!hasTenant && <p className="text-xs text-warning">Tenant context is required for component operations.</p>}
      {!compatibilityOnly && <div className="space-y-2">
        <button type="button" className={BUTTON} disabled={!hasTenant || !canTest || connection.status === 'loading'} onClick={() => void probe()}>
          {connection.status === 'loading' ? 'Testing connection...' : 'Test connection'}
        </button>
        <p className="text-[11px] text-foreground/40">Explicit read-only hook, bounded to 10 seconds. It does not run the pipeline or save Connection metadata.</p>
        {!canTest && <p className="text-[11px] text-foreground/40">{operations?.testConnection === false
          ? 'Connection test unsupported by this component.' : 'Connection test unavailable (not advertised).'}</p>}
        {connection.status === 'error' && <p role="alert" className="text-xs text-destructive break-words">{connection.message}</p>}
        {connection.status === 'success' && (connection.value?.connected === true
          ? <p role="status" className="text-xs text-accent">Connected (read-only probe)</p>
          : <p role="status" className="text-xs text-warning">Connection not confirmed.</p>)}
        {pluginId === 'http' && <p className="text-[11px] text-foreground/40">For HTTP, a successful test confirms only a restricted HEAD request. Business POST/SOAP and write permission are not verified.</p>}
      </div>}

      {showCompatibility && <div className="border-t border-border pt-3 space-y-2">
        <label htmlFor={schemaId} className="block text-xs font-medium text-foreground/60">Input record.Schema JSON</label>
        <p id={`${schemaId}-help`} className="text-[11px] text-foreground/40">Use the schema received by this component after upstream Mapping/Lookup, not raw Source discovery. This is a static precheck, not source data preview.</p>
        {inputEvidence && <p className="text-[11px] text-foreground/60">{inputEvidence.schema ? inputEvidence.scope === 'processed' ? 'Schema 来自当前实际处理后样本。点击才检查目标兼容性；仍需运行时逐值校验。' : '来源直接连接此目标，无处理节点；使用当前来源样本的实际 Schema。' : inputEvidence.message || '请先显式读取当前目标上游的实际样本。'}</p>}
        <textarea id={schemaId} aria-describedby={`${schemaId}-help`} rows={6} spellCheck={false}
          className="w-full bg-muted border border-border rounded-md px-2.5 py-2 text-xs font-mono text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          value={inputEvidence ? inputEvidence.schema ? stringifyJson(inputEvidence.schema, 2) : '' : schemaText} readOnly={!!inputEvidence} disabled={!hasTenant || !canCheck}
          aria-invalid={compatibility.status === 'error' && compatibility.input === true}
          placeholder={'{"fields":[{"name":"amount","kind":"decimal","nullable":true,"precision":38,"scale":18}]}'}
          onChange={(event) => {
            compatibilityRequest.current++;
            compatibilityController.current?.abort();
            clearTimeout(compatibilityTimeout.current);
            setSchemaText(event.target.value);
            setCompatibility({ status: 'idle' });
          }} />
        <button type="button" className={BUTTON} disabled={!hasTenant || !canCheck || invalidDraft || (inputEvidence ? !inputEvidence.schema : !schemaText.trim()) || compatibility.status === 'loading'} onClick={() => void precheck()}>
          {compatibility.status === 'loading' ? 'Checking compatibility...' : 'Check compatibility'}
        </button>
        {compatibility.status === 'loading' && <button type="button" className={BUTTON} onClick={() => {
          compatibilityRequest.current++; compatibilityController.current?.abort(); clearTimeout(compatibilityTimeout.current);
          setCompatibility({ status: 'error', message: 'Compatibility check cancelled; no compatibility conclusion.' });
        }}>Cancel compatibility check</button>}
        {!canCheck && <p className="text-[11px] text-foreground/40">{operations?.checkCompatibility === false
          ? 'Compatibility check unsupported by this component.' : 'Compatibility check unavailable (not advertised).'}</p>}
        {compatibility.status === 'error' && <p role="alert" className="text-xs text-destructive break-words">{compatibility.message}</p>}
        {compatibility.status === 'success' && <div className="space-y-2 text-xs">
          <p role="status" className={compatibility.value.compatible ? 'text-accent' : 'text-warning'}>
            {compatibility.value.compatible ? 'Static schema compatible.' : 'Static schema incompatible.'}
          </p>
          <p className="text-foreground/40">Scope: {compatibility.value.scope}</p>
          <p className="text-warning">Runtime validation is still required; values and execution have not been verified.</p>
          {!!compatibility.value.issues?.length && <div className="overflow-x-auto"><table aria-label="Compatibility issues" className="w-full text-left text-[11px]">
            <thead><tr className="border-b border-border text-foreground/40"><th scope="col" className="px-2 py-1 font-medium">Field</th><th scope="col" className="px-2 py-1 font-medium">Code</th></tr></thead>
            <tbody>{compatibility.value.issues.map((issue, index) => <tr key={`${index}:${issue.field ?? ''}:${issue.code}`} className="border-b border-border/50 text-foreground/70">
              <td className="px-2 py-1 break-words">{issue.field || 'Schema-level'}</td><td className="px-2 py-1 font-mono break-words">{issue.code}</td>
            </tr>)}</tbody>
          </table></div>}
        </div>}
      </div>}
    </section>
  );
}

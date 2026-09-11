import type { PluginInfo, FieldType, ConfigField, TableInfo, ColumnInfo } from '@/types/plugin';
import { ApiError, type CreatePipelineResponse } from '@/types/api';
import type { PipelineSpec } from '@/types/pipeline';
import type { ExecutionProgress } from '@/types/progress';
import { api } from './client';

/** Validate a plugin component's configuration against its schema. */
export async function validateConfig(
  pluginId: string,
  componentId: string,
  config: Record<string, unknown>,
  tenantId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!tenantId?.trim()) throw new Error('Tenant context is required for validation');
  return api.post<{ ok: boolean; message?: string }>('/plugins/validate', {
    pluginId,
    componentId,
    config,
    tenantId,
  });
}

/** Discover tables (no table in config) or columns (table in config) for a
 *  plugin component via POST /plugins/discover-schema (ADR-013). */
export async function discoverSchema(
  pluginId: string,
  componentId: string,
  config: Record<string, unknown>,
  tenantId: string,
): Promise<{ tables: TableInfo[]; columns: ColumnInfo[] }> {
  if (!tenantId?.trim()) throw new Error('Tenant context is required for discovery');
  return api.post<{ tables: TableInfo[]; columns: ColumnInfo[] }>(
    '/plugins/discover-schema',
    { pluginId, componentId, config, tenantId },
  );
}

/** Raw response shape from GET /plugins. */
interface PluginsResponse {
  plugins: PluginInfo[];
}

/** Preserve every declared protocol type; unknown types must not become strings. */
function normalizeFieldType(raw: unknown): FieldType {
  if (typeof raw === 'string') return raw.replace(/^FIELD_TYPE_/, '') as FieldType;
  const protoMap: Record<number, FieldType> = {
    1: 'STRING', 2: 'INTEGER', 3: 'NUMBER', 4: 'BOOLEAN',
    5: 'SECRET', 6: 'ENUM', 7: 'OBJECT', 8: 'ARRAY',
  };
  return protoMap[raw as number] ?? (String(raw) as FieldType);
}

function normalizeConfigField(field: ConfigField): ConfigField {
  type Defaults = NonNullable<ConfigField['defaultValue']>;
  const wire = field as ConfigField & {
    enum_values?: string[];
    default?: {
      string_value?: Defaults['stringValue'];
      int_value?: Defaults['intValue'];
      double_value?: Defaults['numberValue'];
      bool_value?: Defaults['boolValue'];
    };
  };
  return {
    ...field,
    type: normalizeFieldType(field.type),
    enumValues: field.enumValues ?? wire.enum_values,
    defaultValue: field.defaultValue ?? (wire.default ? {
      stringValue: wire.default.string_value,
      intValue: wire.default.int_value,
      numberValue: wire.default.double_value,
      boolValue: wire.default.bool_value,
    } : undefined),
    properties: field.properties?.map(normalizeConfigField),
  };
}

/** Normalize the engine's proto-style configSchema to the designer's TypeScript format. */
function normalizePlugin(plugin: PluginInfo): PluginInfo {
  if (!plugin.components) return plugin;
  return {
    ...plugin,
    components: plugin.components.map((c) => ({
      ...c,
      configSchema: c.configSchema
        ? {
            fields: c.configSchema.fields.map(normalizeConfigField),
          }
        : undefined,
    })),
  };
}

/** Fetch all registered plugins from the Control Plane. */
export async function getPlugins(): Promise<PluginInfo[]> {
  const { plugins } = await api.get<PluginsResponse>('/plugins');
  return plugins.map(normalizePlugin);
}

/** Engine returns UPPERCASE pipeline-level status (model.ExecutionStatus:
 * PENDING/RUNNING/SUCCEEDED/FAILED); the Designer contract is lowercase (matches
 * node-level NodeStatus in dag_run.go + alpha spec success criteria #4). Normalize
 * at the API boundary so toolbar/polling comparisons against lowercase hold. */
export function normalizeStatus<R extends { status: string }>(r: R): R {
  return { ...r, status: r.status.toLowerCase() as R['status'] };
}

/** Require both managed connections and nonexecuting drafts before a managed
 * operation. This capability probe never performs resource I/O. */
export async function requireManagedWorkflow(signal?: AbortSignal): Promise<void> {
  try {
    const health = await api.get<{ pipelineWorkflow?: string; connectionWorkflow?: string }>('/healthz', { signal });
    if (health.pipelineWorkflow !== 'draft-v1' || health.connectionWorkflow !== 'managed-v1') {
      throw new Error('Engine 需要 draft-v1 和 managed-v1 工作流，请更新并重启 Engine');
    }
  } catch (err) {
    // This is a local precondition failure: no managed operation has been sent.
    throw new ApiError(412, `未发送管理操作请求：${err instanceof Error ? err.message : '无法确认 Engine 工作流版本'}`);
  }
}

/** Save a NEW draft only. Incomplete configuration is allowed; never executes. */
export async function submitPipeline(
  specification: PipelineSpec,
  tenantId: string,
  projectId?: string,
): Promise<PipelineDetail> {
  await requireManagedWorkflow();
  return api.post<PipelineDetail>('/pipelines', { tenantId, projectId, specification });
}

/** Confirm a saved revision. Reuse requestId only to resolve the SAME intent,
 * never silently generate another identity after an uncertain response. */
export async function runPipeline(
  pipelineId: string,
  tenantId: string,
  expectedRevision: string,
  requestId: string,
  expectedConnections: Readonly<Record<string, string>>,
): Promise<CreatePipelineResponse> {
  if (!expectedRevision || !requestId) throw new Error('保存版本和运行请求号不能为空');
  if (!expectedConnections || typeof expectedConnections !== 'object' || Array.isArray(expectedConnections)
    || Object.entries(expectedConnections).some(([id, revision]) => !id.trim() || typeof revision !== 'string' || !revision.trim())) {
    throw new ApiError(400, '运行前连接版本快照不能为空；无资源任务必须显式传入空映射。');
  }
  // Copy the confirmed intent before any await, never substitute a fresh map.
  const connections = { ...expectedConnections };
  await requireManagedWorkflow();
  const r = await api.post<CreatePipelineResponse>(
    `/pipelines/${encodeURIComponent(pipelineId)}/run?tenantId=${encodeURIComponent(tenantId)}`,
    { expectedRevision, requestId, expectedConnections: connections },
  );
  return normalizeStatus(r);
}

/** Response from GET /executions/{id}. */
export interface ExecutionStatus {
  executionId: string;
  pipelineId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  createdAt?: string;
  requestId?: string;
  definition?: { revision: string };
  errorMessage?: string;
  progress?: ExecutionProgress | null;
  /** Per-node lifecycle statuses during execution. Present when the engine emits them. */
  nodeStatuses?: Record<string, { nodeId: string; status: string; error?: string }>;
}

/** Poll the execution status from the engine. */
export async function getExecution(
  executionId: string,
  tenantId: string,
): Promise<ExecutionStatus> {
  // The engine serves GET /executions/{id}?tenantId=...
  const r = await api.get<ExecutionStatus & { id?: string }>(
    `/executions/${executionId}?tenantId=${encodeURIComponent(tenantId)}`,
  );
  const id = r.executionId ?? r.id;
  if (!id) throw new Error('Execution detail did not include an ID');
  return normalizeStatus({ ...r, executionId: id });
}

/** Resolve a previously submitted run without starting or replaying anything. */
export async function getExecutionByRequest(requestId: string, tenantId: string): Promise<ExecutionStatus> {
  const r = await api.get<ExecutionStatus & { id?: string }>(
    `/executions/by-request/${encodeURIComponent(requestId)}?tenantId=${encodeURIComponent(tenantId)}`,
  );
  const id = r.executionId ?? r.id;
  if (!id) throw new Error('Execution detail did not include an ID');
  return normalizeStatus({ ...r, executionId: id });
}

/** Full pipeline record returned by GET /api/pipelines/{id} (includes the spec). */
export interface PipelineDetail {
  revision: string;
  projectId?: string;
  validation?: { scope: 'structure'; status: 'invalid' | 'unverified'; errors: string[] };
  pipelineId: string;
  tenantId: string;
  createdAt: string;
  specification: PipelineSpec;
}

/** GET /pipelines/{id} — returns the full spec so the Designer can reload it. */
export async function getPipelineSpec(id: string, tenantId: string): Promise<PipelineDetail> {
  return api.get<PipelineDetail>(`/pipelines/${id}?tenantId=${encodeURIComponent(tenantId)}`);
}

/** PUT /pipelines/{id} — replace name + spec without executing. */
export async function updatePipeline(
  id: string,
  tenantId: string,
  name: string,
  spec: PipelineSpec,
  expectedRevision: string,
): Promise<PipelineDetail> {
  if (!expectedRevision) throw new Error('保存版本不能为空；请重新打开任务');
  await requireManagedWorkflow();
  return api.put<PipelineDetail>(`/pipelines/${id}?tenantId=${encodeURIComponent(tenantId)}`, {
    name,
    expectedRevision,
    specification: spec,
  });
}

/** DELETE /pipelines/{id} — returns void (204). */
export async function deletePipeline(id: string, tenantId: string): Promise<void> {
  await api.del<void>(`/pipelines/${id}?tenantId=${encodeURIComponent(tenantId)}`);
}

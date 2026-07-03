import type { PluginInfo, FieldType } from '@/types/plugin';
import type { CreatePipelineResponse } from '@/types/api';
import type { PipelineSpec } from '@/types/pipeline';
import { api } from './client';

/** Validate a plugin component's configuration against its schema. */
export async function validateConfig(
  pluginId: string,
  componentId: string,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  return api.post<{ ok: boolean; message: string }>('/plugins/validate', {
    pluginId,
    componentId,
    config,
  });
}

/** Raw response shape from GET /plugins. */
interface PluginsResponse {
  plugins: PluginInfo[];
}

/** Map the engine's proto FieldType enum (number) to the designer's FieldType string.
 *  Proto: 1=STRING, 2=INTEGER, 4=BOOLEAN, 5=SECRET, 6=ENUM (3/7/8 unused in Alpha).
 *  The engine serializes ConfigField.type as the proto enum number, but SchemaForm's
 *  switch expects string names — without this, no case matches and inputs don't render. */
function normalizeFieldType(raw: unknown): FieldType {
  if (typeof raw === 'string') return raw as FieldType;
  const protoMap: Record<number, FieldType> = {
    1: 'STRING', 2: 'INTEGER', 4: 'BOOLEAN', 5: 'SECRET', 6: 'ENUM',
  };
  return protoMap[raw as number] ?? 'STRING';
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
            fields: c.configSchema.fields.map((f) => ({
              ...f,
              type: normalizeFieldType(f.type),
            })),
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

/** Submit a pipeline spec for execution. */
export async function submitPipeline(
  specification: PipelineSpec,
  tenantId: string,
  projectId?: string,
): Promise<CreatePipelineResponse> {
  const r = await api.get<CreatePipelineResponse>('/pipelines', {
    method: 'POST',
    body: JSON.stringify({ tenantId, projectId, specification }),
  });
  return normalizeStatus(r);
}

/** Response from GET /executions/{id}. */
export interface ExecutionStatus {
  executionId: string;
  pipelineId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  createdAt?: string;
  errorMessage?: string;
  /** Per-node lifecycle statuses during execution. Present when the engine emits them. */
  nodeStatuses?: Record<string, { nodeId: string; status: string; error?: string }>;
}

/** Poll the execution status from the engine. */
export async function getExecution(
  executionId: string,
  tenantId: string,
): Promise<ExecutionStatus> {
  // The engine serves GET /executions/{id}?tenantId=...
  const r = await api.get<ExecutionStatus>(
    `/executions/${executionId}?tenantId=${encodeURIComponent(tenantId)}`,
  );
  return normalizeStatus(r);
}

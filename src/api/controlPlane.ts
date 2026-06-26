import type { PluginDescriptor } from '@/types/plugin';
import type { CreatePipelineResponse } from '@/types/api';
import type { PipelineSpec } from '@/types/pipeline';
import { api } from './client';

/** Raw response shape from GET /plugins. */
interface PluginsResponse {
  plugins: PluginDescriptor[];
}

/** Fetch all registered plugins from the Control Plane. */
export async function getPlugins(): Promise<Record<string, PluginDescriptor>> {
  const { plugins } = await api.get<PluginsResponse>('/plugins');
  // Index by plugin name for O(1) lookup in palette and config panel.
  const byName: Record<string, PluginDescriptor> = {};
  for (const p of plugins) {
    byName[p.name] = p;
  }
  return byName;
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

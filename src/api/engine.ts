import { api } from './client';
import type {
  ListExecutionsResponse,
  ListPipelinesResponse,
  HealthResponse,
  PipelineSummary,
} from '@/types/admin';
import type { PluginInfo } from '@/types/plugin';

/** GET /plugins response. Uses the canonical PluginInfo (ADR-008
 *  self-describing format: id/version/displayName/components), matching the
 *  palette's contract — not the legacy flat PluginDescriptor. */
export interface PluginsResponse {
  plugins: PluginInfo[];
}

function tenantId(): string {
  return localStorage.getItem('planx-admin:tenant') ?? 'default-tenant';
}

// ── Executions ──

export function fetchExecutions(
  page = 1,
  pageSize = 20,
  statusFilter = '',
): Promise<ListExecutionsResponse> {
  const params = new URLSearchParams({
    tenantId: tenantId(),
    page: String(page),
    pageSize: String(pageSize),
  });
  if (statusFilter) params.set('status', statusFilter);
  return api.get<ListExecutionsResponse>(`/executions?${params}`);
}

// ── Pipelines ──

export function fetchPipelines(
  page = 1,
  pageSize = 20,
): Promise<ListPipelinesResponse> {
  return api.get<ListPipelinesResponse>(
    `/pipelines?tenantId=${tenantId()}&page=${page}&pageSize=${pageSize}`,
  );
}

export function fetchPipelineDetail(pipelineId: string): Promise<PipelineSummary> {
  return api.get<PipelineSummary>(
    `/pipelines/${pipelineId}?tenantId=${tenantId()}`,
  );
}

// ── Plugins ──

export function fetchPlugins(): Promise<PluginsResponse> {
  return api.get<PluginsResponse>('/plugins');
}

// ── Health ──

export function fetchHealth(): Promise<HealthResponse> {
  return api.get<HealthResponse>('/healthz');
}

// ── Admin API types (from planx-admin) ──

// ── Execution ──

export interface ExecutionRecord {
  id: string;
  tenantId: string;
  pipelineId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface ListExecutionsResponse {
  total?: number;
  page?: number;
  pageSize?: number;
  executions: ExecutionRecord[];
}

// ── Pipeline ──

export interface PipelineSummary {
  pipelineId: string;
  tenantId: string;
  lastStatus: string;
  createdAt: string;
  executionCount?: number;
  latestExecution?: ExecutionRecord;
}

export interface ListPipelinesResponse {
  total: number;
  page: number;
  pageSize: number;
  pipelines: PipelineSummary[];
}

// ── Plugin ──

export interface PoolStats {
  active: number;
  idle: number;
  max: number;
  minIdle: number;
  maxIdle: number;
}

export interface PluginDescriptor {
  name: string;
  type: 'source' | 'processor' | 'sink';
  version: string;
  protocol: string;
  pool?: PoolStats;
}

export interface ListPluginsResponse {
  plugins: PluginDescriptor[];
}

// ── Health ──

export interface HealthResponse {
  status: 'ok' | 'degraded';
  error?: string;
}

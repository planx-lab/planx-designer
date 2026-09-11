import type { PipelineSpec } from './pipeline';

/** POST /pipelines request body. */
export interface CreatePipelineRequest {
  specification: PipelineSpec;
  tenantId: string;
  projectId?: string;
}

/** POST /pipelines/{id}/run response body. Draft creation returns PipelineDetail. */
export interface CreatePipelineResponse {
  executionId: string;
  pipelineId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
}

/** Generic API error. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`API ${status}: ${message}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

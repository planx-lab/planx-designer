import type { PipelineSpec } from './pipeline';

/** POST /pipelines request body. */
export interface CreatePipelineRequest {
  specification: PipelineSpec;
  tenantId: string;
  projectId?: string;
}

/** POST /pipelines response body. */
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

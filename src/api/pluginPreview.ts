import { api } from './client';
import type { RecordBatch } from '@/types/record';

export const DEFAULT_PREVIEW_ROWS = 20;
export const MAX_PREVIEW_ROWS = 100;
export const DEFAULT_PREVIEW_BYTES = 65536;
export const MAX_PREVIEW_BYTES = 1048576;
export const MAX_PREVIEW_PROCESSORS = 8;

export interface PreviewLimits {
  maxRows?: number;
  maxBytes?: number;
}

export interface SourcePreviewResult {
  batch: RecordBatch;
  truncated: boolean;
  scope?: 'processed';
  inputRows?: number;
  processorCount?: number;
}

export interface PreviewProcessor {
  pluginId: string;
  componentId: string;
  config: Record<string, unknown>;
}

/** Explicit bounded Source read. No execution, ACK, checkpoint or target write. */
export async function previewSource(
  pluginId: string, componentId: string, config: Record<string, unknown>, tenantId: string,
  limits: PreviewLimits = {}, signal?: AbortSignal,
  processors?: PreviewProcessor[],
): Promise<SourcePreviewResult> {
  if (!tenantId?.trim()) throw new Error('Tenant context is required for source preview');
  if (processors && processors.length > MAX_PREVIEW_PROCESSORS) {
    throw new Error(`Processed preview supports at most ${MAX_PREVIEW_PROCESSORS} processors`);
  }
  if (processors !== undefined && (processors.length === 0 || processors.some((p) => !p.pluginId.trim() || !p.componentId.trim()))) {
    throw new Error('Processed preview requires an explicit supported processor path');
  }
  for (const [value, maximum] of [[limits.maxRows, MAX_PREVIEW_ROWS], [limits.maxBytes, MAX_PREVIEW_BYTES]]) {
    if (value !== undefined && (!Number.isInteger(value) || value < (processors ? 1 : 0) || value > maximum!)) {
      throw new Error('Preview limits must be whole numbers within the server bounds');
    }
  }
  return api.post<SourcePreviewResult>('/plugins/preview', {
    tenantId, pluginId, componentId, config,
    ...(limits.maxRows === undefined ? {} : { maxRows: limits.maxRows }),
    ...(limits.maxBytes === undefined ? {} : { maxBytes: limits.maxBytes }),
    ...(processors === undefined ? {} : { processors }),
  }, signal);
}

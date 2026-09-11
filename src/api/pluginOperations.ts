import { api } from './client';
import type { RecordSchema } from '@/types/record';

export interface ConnectionTestResult {
  connected: boolean;
}

export interface CompatibilityResult {
  compatible: boolean;
  issues?: { field?: string; code: string }[];
  scope: 'static_schema';
  runtimeValidationRequired: true;
}

/** Explicit bounded read-only probe, never metadata validation or pipeline execution. */
export async function testConnection(
  pluginId: string, componentId: string, config: Record<string, unknown>, tenantId: string,
): Promise<ConnectionTestResult> {
  if (!tenantId?.trim()) throw new Error('Tenant context is required for connection testing');
  return api.post<ConnectionTestResult>('/plugins/test-connection', { tenantId, pluginId, componentId, config });
}

/** Static schema check only. The caller supplies the actual post-processor schema. */
export async function checkCompatibility(
  pluginId: string, componentId: string, config: Record<string, unknown>, inputSchema: RecordSchema, tenantId: string,
  signal?: AbortSignal,
): Promise<CompatibilityResult> {
  if (!tenantId?.trim()) throw new Error('Tenant context is required for compatibility checks');
  return api.post<CompatibilityResult>('/plugins/check-compatibility', { tenantId, pluginId, componentId, config, inputSchema }, signal);
}

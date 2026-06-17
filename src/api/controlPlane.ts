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

/** Submit a pipeline spec for execution. */
export function submitPipeline(
  specification: PipelineSpec,
  tenantId: string,
  projectId?: string,
): Promise<CreatePipelineResponse> {
  return api.get<CreatePipelineResponse>('/pipelines', {
    method: 'POST',
    body: JSON.stringify({ tenantId, projectId, specification }),
  });
}

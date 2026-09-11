import { afterEach, expect, it, vi } from 'vitest';
import { previewSource } from './pluginPreview';

afterEach(() => vi.unstubAllGlobals());

it('rejects more than eight processors at the API boundary without network access', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const processors = Array.from({ length: 9 }, () => ({ pluginId: 'records', componentId: 'mapping', config: {} }));
  await expect(previewSource('sqlserver', 'source', {}, 'tenant', { maxRows: 20, maxBytes: 65536 }, undefined, processors)).rejects.toThrow(/8/);
  expect(fetch).not.toHaveBeenCalled();
});

it('sends exactly eight ordered processors to the existing endpoint', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"batch":{"schema":{"fields":[]},"records":[]},"truncated":false,"scope":"processed","inputRows":0,"processorCount":8}'));
  vi.stubGlobal('fetch', fetch);
  const processors = Array.from({ length: 8 }, (_, index) => ({ pluginId: 'records', componentId: 'mapping', config: { index } }));
  await previewSource('sqlserver', 'source', {}, 'tenant', { maxRows: 20, maxBytes: 65536 }, undefined, processors);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('/api/plugins/preview');
  expect(JSON.parse(fetch.mock.calls[0][1].body).processors).toEqual(processors);
});

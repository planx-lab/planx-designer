import { afterEach, expect, it, vi } from 'vitest';
import { getPlugins, validateConfig } from './controlPlane';
import { groupComponentsByKind } from '@/lib/connectors';

afterEach(() => vi.unstubAllGlobals());

it('carries tenant context when validating builtin config', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true,"message":"Valid"}'));
  vi.stubGlobal('fetch', fetch);
  await validateConfig('builtin-postgres', 'source', { connection_ref: 'warehouse' }, 'tenant-a');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    pluginId: 'builtin-postgres', componentId: 'source',
    config: { connection_ref: 'warehouse' }, tenantId: 'tenant-a',
  });
});

it('rejects validation without tenant context before any request', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true,"message":"Valid"}'));
  vi.stubGlobal('fetch', fetch);
  await expect(validateConfig('builtin-postgres', 'source', {}, ' ')).rejects.toThrow(/tenant/i);
  expect(fetch).not.toHaveBeenCalled();
});

it('retains component catalog metadata and uses the supplied component origin', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ plugins: [{
    id: 'catalog-entry', version: '1', displayName: 'Entry',
    components: [{
      id: 'source', kind: 'source', displayName: 'Source', origin: 'builtin', availability: 'available',
      capabilities: { schemaDiscovery: false, source: true },
    }],
  }] }))));
  const plugins = await getPlugins();
  expect(plugins[0].components[0]).toMatchObject({
    origin: 'builtin', availability: 'available', capabilities: { schemaDiscovery: false, source: true },
  });
  expect(plugins[0].origin).toBeUndefined();
  expect(groupComponentsByKind(plugins).source[0].origin).toBe('builtin');
});

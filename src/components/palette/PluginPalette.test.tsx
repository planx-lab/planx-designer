import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PluginPalette } from './PluginPalette';
import { PluginsPage } from '@/components/admin/PluginsPage';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { getPlugins } from '@/api/controlPlane';
import { groupComponentsByKind } from '@/lib/connectors';
import type { PluginInfo } from '@/types/plugin';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('preserves server metadata and shows origin in both existing catalog views', async () => {
  const plugins: PluginInfo[] = [{
    id: 'db', displayName: 'Database', version: '1', origin: 'builtin', availability: 'available',
    capabilities: { connectionTest: false },
    components: [{ id: 'source', kind: 'source', displayName: 'Read', capabilities: { schemaDiscovery: true } }],
  }, {
    id: 'custom', displayName: 'Custom', version: '1', origin: 'external',
    components: [{ id: 'source', kind: 'source', displayName: 'Custom Read' }],
  }, {
    id: 'unknown', displayName: 'Unspecified', version: '1',
    components: [{ id: 'source', kind: 'source', displayName: 'Unspecified Read' }],
  }];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ plugins }))));
  const fetched = await getPlugins();
  expect(fetched[0]).toMatchObject(plugins[0]);
  expect(fetched[2].origin).toBeUndefined();
  expect(fetched[2].availability).toBeUndefined();
  expect(fetched[2].capabilities).toBeUndefined();
  expect(groupComponentsByKind(fetched).source.find((c) => c.pluginId === 'db')?.origin).toBe('builtin');
  usePaletteStore.setState({ plugins: fetched, loading: false, error: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['plugins'], { plugins: fetched });
  render(<MemoryRouter><QueryClientProvider client={client}><PluginPalette /><PluginsPage /></QueryClientProvider></MemoryRouter>);
  expect(screen.getAllByText('builtin')).toHaveLength(2);
  expect(screen.getAllByText('external')).toHaveLength(2);
  cleanup();
  client.clear();
});

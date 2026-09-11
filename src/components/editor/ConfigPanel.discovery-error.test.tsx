import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfigPanel } from './ConfigPanel';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { useUIStore } from '@/stores/useUIStore';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows a real discovery failure without hiding it or resaving connection metadata', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(
    '{"error":"mssql: Invalid object name \'information_schema.tables\'."}', { status: 502 },
  ));
  vi.stubGlobal('fetch', fetch);
  usePipelineStore.getState().reset('reference');
  usePipelineStore.setState({ nodes: [{
    id: 'source', type: 'pipelineNode', position: { x: 0, y: 0 },
    data: {
      name: 'source', nodeType: 'source', pluginId: 'sqlserver', componentId: 'source',
      pluginLabel: 'SQL Server', isValid: true, config: { connection_ref: 'source', batch_rows: 3 },
    },
  }] });
  useUIStore.setState({ selectedNodeId: 'source' });
  usePaletteStore.setState({ plugins: [{
    id: 'sqlserver', version: '1', displayName: 'SQL Server', origin: 'builtin',
    components: [{ id: 'source', kind: 'source', displayName: 'Source', configSchema: {
      fields: [{ name: 'table', type: 'STRING', label: 'Table' }],
    } }],
  }] });
  render(<ConfigPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Discover', exact: true }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Schema discovery failed');
  expect(alert).toHaveTextContent("Invalid object name 'information_schema.tables'");
  expect(screen.getByRole('button', { name: 'Discover', exact: true })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain('/plugins/discover-schema');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    tenantId: 'reference', pluginId: 'sqlserver', componentId: 'source',
    config: { connection_ref: 'source', batch_rows: 3 },
  });
});

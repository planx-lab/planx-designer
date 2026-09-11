import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfigPanel } from './ConfigPanel';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { useUIStore } from '@/stores/useUIStore';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('discovers tables and columns from an empty panel with the active tenant', async () => {
  usePipelineStore.getState().reset('tenant-a');
  usePaletteStore.setState({ plugins: [{
    id: 'postgres', version: '1', displayName: 'PostgreSQL', components: [{
      id: 'source', kind: 'source', displayName: 'Source', configSchema: { fields: [
        { name: 'table', type: 'STRING' }, { name: 'columns', type: 'STRING' },
      ] },
    }],
  }] });
  const node = usePipelineStore.getState().addNode('source', 'postgres', 'source', 'Source');
  usePipelineStore.getState().setConfig(node.id, { host: 'db', table: 'public.old', columns: 'old' });
  useUIStore.getState().selectNode(node.id);
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('{"tables":[{"schema":"public","name":"users","kind":"TABLE"},{"schema":"reporting","name":"active_users","kind":"VIEW"}],"columns":[]}'))
    .mockResolvedValueOnce(new Response('{"tables":[],"columns":[{"name":"id","type":"bigint","nullable":false}]}'));
  vi.stubGlobal('fetch', fetch);

  render(<ConfigPanel />);
  fireEvent.click(screen.getByRole('button', { name: /^discover$/i }));
  expect(await screen.findByRole('option', { name: 'public.users (Table)' })).toHaveValue('public.users');
  expect(screen.getByRole('option', { name: 'reporting.active_users (View)' })).toHaveValue('reporting.active_users');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    tenantId: 'tenant-a', pluginId: 'postgres', componentId: 'source', config: { host: 'db' },
  });
  fireEvent.change(screen.getByLabelText('table'), { target: { value: 'public.users' } });
  await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
    tenantId: 'tenant-a', config: { host: 'db', table: 'public.users' },
  });
  expect(usePipelineStore.getState().nodes[0].data.config.columns).toBeUndefined();
});

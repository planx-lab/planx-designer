import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ConfigPanel } from './ConfigPanel';
import { getPlugins } from '@/api/controlPlane';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { useUIStore } from '@/stores/useUIStore';
import { useConnectionRevisionStore } from '@/stores/useConnectionRevisionStore';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Actual current Catalog wire shapes; all HTTP/credential/data results below
// are isolated test doubles, not evidence of a live database or browser pass.
async function openPanel({ discovery = false, connectionKinds = ['postgres'], origin = 'builtin', reference = 'pg' }: {
  discovery?: boolean | 'omitted'; connectionKinds?: string[]; origin?: 'builtin' | 'external'; reference?: string;
} = {}) {
  const tenantId = 'catalog-support';
  const resources = ['postgres', 'mysql', 'file'].map((driver) => ({
    id: driver === 'postgres' ? 'pg' : driver, tenantId, driver, name: driver,
    parameters: {}, configuredSecrets: { password: true }, ready: true,
    revision: `${driver}-editor`, runtimeRevision: `${driver}-runtime`, version: 1,
  }));
  const wire = { plugins: [{ id: 'catalog-component', version: '1', displayName: 'Catalog component', origin,
    components: [{ id: 'enrich', kind: 'processor', displayName: 'Enrich', origin, connectionKinds,
      operations: { testConnection: false, checkCompatibility: false, preview: false,
        ...(discovery === 'omitted' ? {} : { discoverSchema: discovery }) },
      configSchema: { fields: [
        { name: 'connection_ref', type: 1, label: 'Connection', required: true },
        { name: 'table', type: 1, label: 'Table' },
        { name: 'columns', type: 8, label: 'Columns' },
      ] },
    }],
  }] };
  const response = (body: unknown) => new Response(JSON.stringify(body));
  const requests = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/plugins')) return response(wire);
    if (url.endsWith('/healthz')) return response({ pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v1' });
    if (url.includes('/connection-kinds?')) return response(resources.map(({ driver }) => ({ kind: driver, fields: [
      { name: 'host', label: 'Host', required: true },
      { name: 'password', label: 'Password', required: true, secret: true },
    ] })));
    if (url.includes('/connections?')) return response({ connections: resources });
    if (url.endsWith('/plugins/discover-schema')) {
      const body = JSON.parse(String(init?.body));
      return response(body.config.table ? { tables: [], columns: [
        { name: 'record_id', type: 'bigint', nullable: false }, { name: 'amount', type: 'numeric', nullable: false },
      ] } : { tables: [
        { schema: 'synthetic', name: 'source_rows', kind: 'TABLE' },
        { schema: 'synthetic', name: 'source_view', kind: 'VIEW' },
      ], columns: [] });
    }
    throw new Error('Unexpected request: ' + url);
  });
  vi.stubGlobal('fetch', requests);
  usePipelineStore.getState().reset(tenantId);
  useConnectionRevisionStore.setState({ revisions: {}, fingerprints: {} });
  usePaletteStore.setState({ plugins: await getPlugins(), loading: false, error: null });
  const node = usePipelineStore.getState().addNode('processor', 'catalog-component', 'enrich', 'Enrich');
  usePipelineStore.getState().setConfig(node.id, { connection_ref: reference, table: 'synthetic.retained', columns: ['amount'] });
  useUIStore.setState({ selectedNodeId: node.id });
  render(<ConfigPanel showSourcePreview={false} />);
  await waitFor(() => expect(screen.getByLabelText('Connection', { exact: false })).toBeEnabled());
  return { requests, wire, node, original: usePipelineStore.getState().nodes[0].data.config };
}

it('honors explicit unsupported discovery without changing the editable table or calling the hook', async () => {
  const { requests, original } = await openPanel();
  expect(screen.queryByRole('button', { name: 'Discover' })).not.toBeInTheDocument();
  expect(screen.getByText('Schema discovery unsupported by this component.')).toBeInTheDocument();
  expect(screen.getByLabelText('Table')).toHaveValue('synthetic.retained');
  expect(usePipelineStore.getState().nodes[0].data.config).toBe(original);
  expect(requests.mock.calls.some(([url]) => url.includes('discover-schema'))).toBe(false);
});

it.each(['builtin', 'external'] as const)('keeps omitted %s discovery capability unknown rather than manufacturing support', async (origin) => {
  await openPanel({ discovery: 'omitted', origin });
  expect(screen.queryByRole('button', { name: 'Discover' })).not.toBeInTheDocument();
  expect(screen.getByText('Schema discovery support not reported by this component.')).toBeInTheDocument();
});

it('filters existing and new connection kinds from the component Catalog without adding config.driver', async () => {
  const { original } = await openPanel({ reference: 'mysql' });
  expect(screen.getByRole('option', { name: 'mysql (not available)' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'postgres (postgres)' })).toBeEnabled();
  expect(screen.queryByRole('option', { name: 'mysql (mysql)' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'file (file)' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'New connection' }));
  const select = await screen.findByLabelText('Connection kind');
  await within(select).findByRole('option', { name: 'postgres', exact: true });
  expect(select).toHaveValue('postgres');
  expect(select).toBeDisabled();
  expect(within(select).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['', 'postgres']);
  expect(usePipelineStore.getState().nodes[0].data.config).toBe(original);
  expect(original).not.toHaveProperty('driver');
});

it('supports a declared set of kinds without offering other existing resources or new profiles', async () => {
  await openPanel({ connectionKinds: ['postgres', 'mysql'] });
  expect(screen.getByRole('option', { name: 'mysql (mysql)' })).toBeEnabled();
  expect(screen.queryByRole('option', { name: 'file (file)' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'New connection' }));
  const select = await screen.findByLabelText('Connection kind');
  await within(select).findByRole('option', { name: 'mysql', exact: true });
  expect(select).toBeEnabled();
  expect(within(select).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['', 'postgres', 'mysql']);
});

it('treats an explicit empty kind list as no managed kinds and preserves an incompatible reference', async () => {
  await openPanel({ connectionKinds: [] });
  expect(screen.getByRole('option', { name: 'pg (not available)' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'New connection' })).toBeDisabled();
  expect(screen.queryByRole('option', { name: 'postgres (postgres)' })).not.toBeInTheDocument();
});

it('uses declared discovery for table/view and ordered ARRAY columns without coercing the wire field type', async () => {
  const { requests } = await openPanel({ discovery: true });
  fireEvent.click(screen.getByRole('button', { name: 'Discover' }));
  await screen.findByRole('option', { name: 'synthetic.source_view (View)' });
  expect(screen.getByRole('option', { name: 'synthetic.source_rows (Table)' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Table'), { target: { value: 'synthetic.source_view' } });
  const amount = await screen.findByRole('checkbox', { name: 'amount', exact: true });
  expect(amount).not.toBeChecked();
  fireEvent.click(amount);
  fireEvent.click(screen.getByRole('checkbox', { name: 'record_id', exact: true }));
  expect(usePipelineStore.getState().nodes[0].data.config).toEqual({
    connection_ref: 'pg', table: 'synthetic.source_view', columns: ['amount', 'record_id'],
  });
  const calls = requests.mock.calls.filter(([url]) => url.includes('discover-schema'));
  expect(calls).toHaveLength(2);
  expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ tenantId: 'catalog-support', pluginId: 'catalog-component', componentId: 'enrich', config: { connection_ref: 'pg' } });
  expect(requests.mock.calls.some(([url]) => /\/run|\/preview|test-connection/.test(url))).toBe(false);
});

it('discards a pending discovery when Catalog support is withdrawn', async () => {
  const { requests } = await openPanel({ discovery: true });
  let finish!: (response: Response) => void;
  requests.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Discover' }));
  act(() => usePaletteStore.setState((state) => ({ plugins: state.plugins.map((plugin) => ({
    ...plugin, components: plugin.components.map((component) => ({
      ...component, operations: { ...component.operations!, discoverSchema: false },
    })),
  })) })));
  await act(async () => finish(new Response('{"tables":[{"schema":"old","name":"stale","kind":"TABLE"}],"columns":[]}')));
  expect(screen.queryByRole('option', { name: 'old.stale (Table)' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Discover' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Table')).toHaveValue('synthetic.retained');
});

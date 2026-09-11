import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfigPanel } from './ConfigPanel';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { useUIStore } from '@/stores/useUIStore';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const operations = { testConnection: true, checkCompatibility: true };
const schemaText = JSON.stringify({ fields: [
  { name: 'record_id', kind: 'int64', nullable: false, precision: 0, scale: 0 },
  { name: 'amount', kind: 'decimal', nullable: true, precision: 38, scale: 18 },
] });

function openPanel(advertised: typeof operations | undefined = operations, tenantId = 'reference', pluginId = 'postgres') {
  usePipelineStore.getState().reset(tenantId);
  usePipelineStore.setState({ nodes: [{
    id: 'write', type: 'pipelineNode', position: { x: 0, y: 0 },
    data: { name: 'write', nodeType: 'sink', pluginId, componentId: 'sink', pluginLabel: pluginId, isValid: true, config: { connection_ref: 'target', table: 'reference.target_records' } },
  }] });
  useUIStore.setState({ selectedNodeId: 'write' });
  usePaletteStore.setState({ plugins: [{
    id: pluginId, version: '1', displayName: pluginId, origin: 'builtin',
    components: [{ id: 'sink', kind: 'sink', displayName: 'Sink', operations: advertised, configSchema: {
      fields: [{ name: 'table', type: 'STRING', label: 'Table' }],
    } }],
  }] });
  render(<ConfigPanel />);
}

function checkSchema(text = schemaText) {
  fireEvent.change(screen.getByLabelText('Input record.Schema JSON'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Check compatibility', exact: true }));
}

it('keeps configuration validation distinct from an explicit successful connection probe', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('{"ok":true}'))
    .mockResolvedValueOnce(new Response('{"connected":true}'));
  vi.stubGlobal('fetch', fetch);
  openPanel();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Validate Config', exact: true }));
  await screen.findByText('Configuration is valid. This does not test the connection.');
  expect(screen.queryByText('Connected (read-only probe)')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Test connection', exact: true }));
  await screen.findByText('Connected (read-only probe)');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toMatch(/\/plugins\/test-connection$/);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    tenantId: 'reference', pluginId: 'postgres', componentId: 'sink', config: { connection_ref: 'target', table: 'reference.target_records' },
  });
});

it.each([{ connected: false }, {}, { connected: 'true' }])('never marks an unconfirmed response connected: %j', async (result) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(result))));
  openPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Test connection', exact: true }));
  await screen.findByText('Connection not confirmed.');
  expect(screen.queryByText('Connected (read-only probe)')).not.toBeInTheDocument();
});

it.each([undefined, { testConnection: false, checkCompatibility: false }])('does not infer unsupported or absent hook capabilities: %j', (advertised) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  openPanel(advertised);
  if (advertised === undefined) act(() => usePaletteStore.setState({ plugins: usePaletteStore.getState().plugins.map((plugin) => ({ ...plugin, components: plugin.components.map((component) => ({ ...component, operations: undefined })) })) }));
  expect(screen.getByRole('button', { name: 'Test connection', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Check compatibility', exact: true })).toBeDisabled();
  expect(screen.getByText(advertised ? 'Connection test unsupported by this component.' : 'Connection test unavailable (not advertised).')).toBeInTheDocument();
  expect(screen.getByText(advertised ? 'Compatibility check unsupported by this component.' : 'Compatibility check unavailable (not advertised).')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it('shows an advertised hook returning 501 as unsupported, never connected or compatible', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(
    '{"error":"Component does not support this operation","code":"unsupported"}', { status: 501 },
  )));
  vi.stubGlobal('fetch', fetch);
  openPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Test connection', exact: true }));
  await screen.findByText(/Connection test unsupported by server \(501\)/);
  checkSchema();
  await screen.findByText(/Compatibility check unsupported by server \(501\)/);
  expect(screen.queryByText('Connected (read-only probe)')).not.toBeInTheDocument();
  expect(screen.queryByText('Static schema compatible.')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('shows network failure without manufacturing connection success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  openPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Test connection', exact: true }));
  await screen.findByText(/Connection test failed: offline/);
  expect(screen.queryByText('Connected (read-only probe)')).not.toBeInTheDocument();
});

it('limits HTTP connected claims to the read-only HEAD probe', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"connected":true}')));
  openPanel(operations, 'reference', 'http');
  fireEvent.click(screen.getByRole('button', { name: 'Test connection', exact: true }));
  await screen.findByText('Connected (read-only probe)');
  expect(screen.getByText(/restricted HEAD request/)).toHaveTextContent('Business POST/SOAP and write permission are not verified.');
});

it('requires tenant context before either operation', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  openPanel(operations, '');
  expect(screen.getByRole('button', { name: 'Test connection', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Check compatibility', exact: true })).toBeDisabled();
  expect(screen.getByText('Tenant context is required for component operations.')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it('does not apply a late connection result to edited configuration', async () => {
  let resolve!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done; })));
  openPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Test connection', exact: true }));
  fireEvent.change(screen.getByLabelText('Table'), { target: { value: 'reference.other_target' } });
  await act(async () => resolve(new Response('{"connected":true}')));
  expect(screen.queryByText('Connected (read-only probe)')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Test connection', exact: true })).toBeEnabled();
});

it('prechecks an explicit post-processor schema without modifying node config or claiming runtime validation', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"compatible":true,"scope":"static_schema","runtimeValidationRequired":true}'));
  vi.stubGlobal('fetch', fetch);
  openPanel();
  expect(screen.getByText(/after upstream Mapping\/Lookup/)).toBeInTheDocument();
  checkSchema();
  await screen.findByText('Static schema compatible.');
  expect(screen.getByText('Runtime validation is still required; values and execution have not been verified.')).toBeInTheDocument();
  expect(JSON.parse(fetch.mock.calls[0][1].body).inputSchema).toEqual(JSON.parse(schemaText));
  expect(usePipelineStore.getState().nodes[0].data.config).toEqual({ connection_ref: 'target', table: 'reference.target_records' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('renders static compatibility issue fields and codes without a runtime-pass claim', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    compatible: false, issues: [{ field: 'amount', code: 'decimal_precision_narrowing' }, { code: 'schema_required' }],
    scope: 'static_schema', runtimeValidationRequired: true,
  }))));
  openPanel();
  checkSchema();
  await screen.findByText('Static schema incompatible.');
  expect(screen.getByText('amount')).toBeInTheDocument();
  expect(screen.getByText('decimal_precision_narrowing')).toBeInTheDocument();
  expect(screen.getByText('schema_required')).toBeInTheDocument();
  expect(screen.getByText('Schema-level')).toBeInTheDocument();
});

it.each(['{', '[]', '{"fields":null}'])('rejects invalid schema JSON locally: %s', async (schema) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  openPanel();
  checkSchema(schema);
  await screen.findByText(/Input schema must be a JSON object with a fields array/);
  expect(screen.getByLabelText('Input record.Schema JSON')).toHaveValue(schema);
  expect(fetch).not.toHaveBeenCalled();
});

it('does not infer missing static scope or runtime-validation fields', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"compatible":true}')));
  openPanel();
  checkSchema();
  await screen.findByText(/Unrecognized compatibility response/);
  expect(screen.queryByText('Static schema compatible.')).not.toBeInTheDocument();
});

it('invalidates compatibility results when the supplied schema changes, including a late response', async () => {
  let resolve!: (value: Response) => void;
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('{"compatible":true,"scope":"static_schema","runtimeValidationRequired":true}'))
    .mockReturnValueOnce(new Promise<Response>((done) => { resolve = done; }));
  vi.stubGlobal('fetch', fetch);
  openPanel();
  checkSchema();
  await screen.findByText('Static schema compatible.');
  checkSchema('{"fields":[]}');
  fireEvent.change(screen.getByLabelText('Input record.Schema JSON'), { target: { value: schemaText } });
  await act(async () => resolve(new Response('{"compatible":true,"scope":"static_schema","runtimeValidationRequired":true}')));
  await waitFor(() => expect(screen.queryByText('Static schema compatible.')).not.toBeInTheDocument());
});

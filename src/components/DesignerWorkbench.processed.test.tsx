import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { DesignerWorkbench } from './DesignerWorkbench';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { useUIStore } from '@/stores/useUIStore';
import { getConnections, saveConnection } from '@/api/connections';
import { parseJson, stringifyJson } from '@/lib/json';
import type { PipelineNode } from '@/types/node';
import type { RecordBatch } from '@/types/record';

vi.mock('@/components/canvas/PipelineCanvas', () => ({ PipelineCanvas: () => <div>Graph</div> }));
vi.mock('@/components/palette/PluginPalette', () => ({ PluginPalette: () => <div>Catalog</div> }));
vi.mock('@/components/preview/SpecPreview', () => ({ SpecPreview: () => <div>Specification</div> }));

const sourceBatch: RecordBatch = { schema: { fields: [{ name: 'raw', kind: 'string', nullable: false }] }, records: [{ raw: { kind: 'string', present: true, null: false, data: 'source only' } }] };
const batch: RecordBatch = {
  schema: { fields: [
    { name: 'renamed', kind: 'int64', nullable: false },
    { name: 'amount', kind: 'decimal', nullable: false, precision: 38, scale: 18 },
    { name: 'instant', kind: 'timestamp', nullable: false, timePrecision: 9 },
    { name: 'civil', kind: 'datetime', nullable: false, timePrecision: 0 },
    { name: 'missing', kind: 'string', nullable: true },
    { name: 'nil', kind: 'string', nullable: true },
    { name: 'empty', kind: 'string', nullable: false },
  ] },
  records: [{
    renamed: { kind: 'int64', present: true, null: false, data: '9007199254740993' },
    amount: { kind: 'decimal', present: true, null: false, data: { coefficient: '12345678901234567890123456789012345678', exponent: -18 } },
    instant: { kind: 'timestamp', present: true, null: false, data: '2026-09-09T01:02:03.123456789Z' },
    civil: { kind: 'datetime', present: true, null: false, data: '2026-09-09T01:02:03' },
    missing: { kind: 'string', present: false, null: false },
    nil: { kind: 'string', present: true, null: true },
    empty: { kind: 'string', present: true, null: false, data: '' },
  }],
};
const processed = { batch, truncated: false, scope: 'processed', inputRows: 3, processorCount: 2 };
const compatible = { compatible: true, scope: 'static_schema', runtimeValidationRequired: true };
const response = (value: unknown) => new Response(stringifyJson(value));
const node = (id: string, kind: 'source' | 'processor' | 'sink', pluginId: string, config: Record<string, unknown> = {}): PipelineNode => ({
  id, type: 'pipelineNode', position: { x: 0, y: 0 },
  data: { nodeType: kind, name: id, pluginId, componentId: id, pluginLabel: id, config, isValid: true },
});
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });
function seed() {
  usePipelineStore.getState().reset('preview-tenant');
  usePipelineStore.setState({ name: 'preserved draft', nodes: [
    node('sink', 'sink', 'postgres', { table: 'target' }),
    node('lookup', 'processor', 'lookup', { connection_ref: 'reference', keys: ['id'] }),
    node('source', 'source', 'sqlserver', { table: 'source' }),
    node('mapping', 'processor', 'records', parseJson('{"mappings":[{"target":"renamed","expression":"record.id"}],"exact":9007199254740993,"decimal":123456789.012345678900}') as Record<string, unknown>),
  ], edges: [edge('lookup', 'sink'), edge('source', 'mapping'), edge('mapping', 'lookup')] });
  usePaletteStore.setState({ loading: false, error: null, plugins: usePipelineStore.getState().nodes.map((n) => ({
    id: n.data.pluginId, version: '1', displayName: n.id, origin: 'builtin', components: [{
      id: n.id, kind: n.data.nodeType, displayName: n.id, origin: 'builtin',
      configSchema: { fields: [{ name: 'table', type: 'STRING', label: 'Table' }] },
      operations: { testConnection: false, checkCompatibility: n.id === 'sink', preview: n.id === 'source' },
    }],
  })) });
  useUIStore.setState({ selectedNodeId: 'sink', showPreview: false, tenantId: 'preview-tenant' });
}
const start = () => fireEvent.click(screen.getByRole('button', { name: 'Preview processed data', exact: true }));
const source = () => fireEvent.click(screen.getByRole('button', { name: 'Preview source data', exact: true }));
const check = () => fireEvent.click(screen.getByRole('button', { name: 'Check compatibility', exact: true }));
const processedRegion = () => within(screen.getByRole('region', { name: 'Processed data preview' }));

beforeEach(seed);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('requests the actual edge-ordered chain once, preserves exact config and renders resultant typed values', async () => {
  const fetch = vi.fn().mockResolvedValue(response(processed)); vi.stubGlobal('fetch', fetch);
  render(<DesignerWorkbench />);
  expect(fetch).not.toHaveBeenCalled(); start();
  const records = await screen.findByLabelText('Processed typed preview records');
  const request = parseJson(fetch.mock.calls[0][1].body) as { processors: { pluginId: string; componentId: string }[] };
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('/api/plugins/preview');
  expect(request).toMatchObject({ tenantId: 'preview-tenant', pluginId: 'sqlserver', componentId: 'source', maxRows: 20, maxBytes: 65536 });
  expect(request.processors.map((p) => `${p.pluginId}/${p.componentId}`)).toEqual(['records/mapping', 'lookup/lookup']);
  expect(fetch.mock.calls[0][1].body).toContain('9007199254740993');
  expect(fetch.mock.calls[0][1].body).toContain('123456789.012345678900');
  expect(records.textContent).toBe(stringifyJson(batch.records, 2));
  expect(screen.getByLabelText('Processed preview record.Schema').textContent).toBe(stringifyJson(batch.schema, 2));
  expect(processedRegion().getByText('未提供')).toBeInTheDocument();
  expect(processedRegion().getByText('NULL')).toBeInTheDocument();
  expect(processedRegion().getByText('空字符串')).toBeInTheDocument();
});

it('uses only current actual processor output for explicit target compatibility; source is distinct', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({ batch: sourceBatch, truncated: false })).mockResolvedValueOnce(response(processed)).mockResolvedValueOnce(response(compatible));
  vi.stubGlobal('fetch', fetch); render(<DesignerWorkbench />);
  source(); await screen.findByLabelText('Typed preview records');
  expect(screen.getByRole('button', { name: 'Check compatibility' })).toBeDisabled();
  expect(screen.queryByLabelText('Processed typed preview records')).not.toBeInTheDocument();
  start(); await screen.findByLabelText('Processed typed preview records');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('Input record.Schema JSON')).toHaveValue(stringifyJson(batch.schema, 2));
  expect(screen.getByLabelText('Input record.Schema JSON')).toHaveAttribute('readonly');
  check(); await screen.findByText('Static schema compatible.');
  expect(fetch.mock.calls[2][0]).toBe('/api/plugins/check-compatibility');
  expect(parseJson(fetch.mock.calls[2][1].body)).toEqual({ tenantId: 'preview-tenant', pluginId: 'postgres', componentId: 'sink', config: { table: 'target' }, inputSchema: batch.schema });
});

it('accepts actual source schema only for a direct source-to-sink edge', async () => {
  usePipelineStore.setState({ nodes: usePipelineStore.getState().nodes.filter((n) => n.data.nodeType !== 'processor'), edges: [edge('source', 'sink')] });
  const fetch = vi.fn().mockResolvedValueOnce(response({ batch: sourceBatch, truncated: false })).mockResolvedValueOnce(response(compatible));
  vi.stubGlobal('fetch', fetch); render(<DesignerWorkbench />); source();
  await screen.findByLabelText('Typed preview records'); check(); await screen.findByText('Static schema compatible.');
  expect(parseJson(fetch.mock.calls[1][1].body)).toMatchObject({ inputSchema: sourceBatch.schema });
  expect(screen.queryByLabelText('Processed typed preview records')).not.toBeInTheDocument();
});

it.each(['missing', 'branch', 'merge', 'cycle', 'dangling', 'external', 'unknown'])('rejects unsupported %s paths without falling back to source schema', async (kind) => {
  const state = usePipelineStore.getState();
  if (kind === 'missing') usePipelineStore.setState({ edges: [] });
  if (kind === 'branch') usePipelineStore.setState({ edges: [...state.edges, edge('source', 'sink')] });
  if (kind === 'merge') usePipelineStore.setState({ edges: [...state.edges, edge('mapping', 'sink')] });
  if (kind === 'cycle') usePipelineStore.setState({ edges: [...state.edges, edge('lookup', 'mapping')] });
  if (kind === 'dangling') usePipelineStore.setState({ edges: [...state.edges, edge('absent', 'lookup')] });
  if (kind === 'external' || kind === 'unknown') usePaletteStore.setState({ plugins: usePaletteStore.getState().plugins.flatMap((p) => p.id !== 'records' ? [p] : kind === 'unknown' ? [] : [{ ...p, origin: 'external', components: p.components.map((c) => ({ ...c, origin: 'external' })) }]) });
  const fetch = vi.fn().mockResolvedValue(response({ batch: sourceBatch, truncated: false })); vi.stubGlobal('fetch', fetch);
  render(<DesignerWorkbench />); source(); await screen.findByLabelText('Typed preview records');
  expect(screen.getByRole('button', { name: 'Preview processed data' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Check compatibility' })).toBeDisabled();
  expect(screen.getAllByText(/处理后预览不可用/).length).toBeGreaterThan(0);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(['tenant', 'selection', 'config', 'source-config', 'edges', 'identity', 'catalog-version'])('aborts and ignores late processed responses on %s changes', async (change) => {
  let resolve!: (value: Response) => void;
  const fetch = vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done; })); vi.stubGlobal('fetch', fetch);
  render(<DesignerWorkbench />); start(); const signal = fetch.mock.calls[0][1].signal as AbortSignal;
  act(() => {
    if (change === 'tenant') usePipelineStore.getState().setTenantId('other');
    if (change === 'selection') useUIStore.getState().selectNode('mapping');
    if (change === 'config') usePipelineStore.getState().setConfig('mapping', { changed: true });
    if (change === 'source-config') usePipelineStore.getState().setConfig('source', { table: 'changed' });
    if (change === 'edges') usePipelineStore.setState({ edges: [] });
    if (change === 'identity') usePipelineStore.getState().setComponent('lookup', 'unknown', 'processor', 'Changed');
    if (change === 'catalog-version') usePaletteStore.setState({ plugins: usePaletteStore.getState().plugins.map((p) => ({ ...p, version: '2' })) });
  });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(response(processed)));
  expect(screen.queryByLabelText('Processed typed preview records')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('invalidates samples and an in-flight compatibility check when observed connection version changes', async () => {
  let resolve!: (value: Response) => void;
  const resources = (version: number) => ({ connections: [{
    tenantId: 'preview-tenant', id: 'reference', driver: 'postgres', name: 'Reference',
    parameters: { host: 'reference.test', database: 'reference', username: 'reader' },
    revision: `editor-${version}`, runtimeRevision: `runtime-${version}`, version,
    configuredSecrets: { password: true }, ready: true,
  }] });
  const fetch = vi.fn().mockResolvedValueOnce(response(resources(1))).mockResolvedValueOnce(response(processed))
    .mockReturnValueOnce(new Promise<Response>((done) => { resolve = done; })).mockResolvedValueOnce(response(resources(2)));
  vi.stubGlobal('fetch', fetch); await getConnections('preview-tenant'); render(<DesignerWorkbench />);
  start(); await screen.findByLabelText('Processed typed preview records'); check();
  const signal = fetch.mock.calls[2][1].signal as AbortSignal;
  await act(async () => { await getConnections('preview-tenant'); });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(response(compatible)));
  expect(screen.queryByText('Static schema compatible.')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Processed typed preview records')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check compatibility' })).toBeDisabled();
});

it('invalidates immediately after saving resource runtime settings, before any refresh', async () => {
  const connection = {
    tenantId: 'preview-tenant', id: 'reference', driver: 'postgres', name: 'Reference',
    parameters: { host: 'changed-reference.test', database: 'reference', username: 'reader' },
  };
  const saved = {
    ...connection, revision: 'editor-2', runtimeRevision: 'runtime-2', version: 2,
    configuredSecrets: { password: true }, ready: true,
  };
  const fetch = vi.fn().mockResolvedValueOnce(response(processed))
    .mockResolvedValueOnce(response({ status: 'ok', pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v1' }))
    .mockResolvedValueOnce(response(saved));
  vi.stubGlobal('fetch', fetch); render(<DesignerWorkbench />); start(); await screen.findByLabelText('Processed typed preview records');
  await act(async () => { await saveConnection({
    connection, expectedRevision: 'editor-1', secrets: { password: { action: 'keep' } },
  }, 'runtime-1'); });
  expect(screen.queryByLabelText('Processed typed preview records')).not.toBeInTheDocument();
});

it('retains the actual schema for zero output rows and describes the bounded sample truthfully', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...processed, batch: { schema: batch.schema, records: [] } })));
  render(<DesignerWorkbench />); start(); await screen.findByLabelText('Processed preview record.Schema');
  expect(screen.getByText('3 input rows · 0 output rows · 2 processors')).toBeInTheDocument();
  expect(screen.getByText(/当前有界样本处理后为 0 行/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check compatibility' })).toBeEnabled();
  expect(screen.queryByText(/source is empty/i)).not.toBeInTheDocument();
});

it.each([400, 502, 422, 504, 501])('clears previous samples and green compatibility on processed HTTP %s without raw errors', async (status) => {
  const fetch = vi.fn().mockResolvedValueOnce(response(processed)).mockResolvedValueOnce(response(compatible)).mockResolvedValueOnce(new Response('SECRET_DRIVER_TEXT', { status }));
  vi.stubGlobal('fetch', fetch); render(<DesignerWorkbench />); start(); await screen.findByLabelText('Processed typed preview records');
  check(); await screen.findByText('Static schema compatible.'); start();
  await waitFor(() => expect(processedRegion().getByRole('alert')).toBeInTheDocument());
  expect(screen.queryByText(/SECRET_DRIVER_TEXT/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Processed typed preview records')).not.toBeInTheDocument();
  expect(screen.queryByText('Static schema compatible.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check compatibility' })).toBeDisabled();
});

it('rejects a source-only response to a processed request', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ batch: sourceBatch, truncated: false })));
  render(<DesignerWorkbench />); start(); await screen.findByText('Unrecognized processed preview response; no data is shown.');
  expect(screen.getByRole('button', { name: 'Check compatibility' })).toBeDisabled();
});

it('cancels processed requests and ignores their late success', async () => {
  let resolve!: (value: Response) => void;
  const fetch = vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done; })); vi.stubGlobal('fetch', fetch);
  render(<DesignerWorkbench />); start(); fireEvent.click(processedRegion().getByRole('button', { name: 'Cancel preview' }));
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => resolve(response(processed)));
  expect(screen.queryByLabelText('Processed typed preview records')).not.toBeInTheDocument();
});

it('enforces the 10-second client timeout even if transport ignores abort', async () => {
  vi.useFakeTimers(); const fetch = vi.fn().mockReturnValue(new Promise(() => {})); vi.stubGlobal('fetch', fetch);
  render(<DesignerWorkbench />); start(); await act(async () => { vi.advanceTimersByTime(10000); });
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(processedRegion().getByRole('alert')).toHaveTextContent(/10-second/);
  expect(screen.getByRole('button', { name: 'Preview processed data' })).toBeEnabled();
});

it.each(['configInvalid', 'configDraftInvalid'])('blocks unapplied %s drafts and invalidates prior evidence', async (attribute) => {
  const fetch = vi.fn().mockResolvedValue(response(processed)); vi.stubGlobal('fetch', fetch);
  render(<DesignerWorkbench />); start(); await screen.findByLabelText('Processed typed preview records');
  const draft = document.createElement('textarea'); draft.dataset[attribute] = 'true';
  await act(async () => { document.body.appendChild(draft); });
  try {
    source(); start(); check();
    expect(screen.queryByLabelText('Processed typed preview records')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { await act(async () => draft.remove()); }
});

it.each([['Maximum preview rows', '0'], ['Maximum preview rows', '101'], ['Maximum preview rows', '1.5'], ['Maximum preview bytes', '1048577']])('blocks invalid processed limits %s=%s', (label, value) => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); render(<DesignerWorkbench />);
  fireEvent.change(processedRegion().getByLabelText(label), { target: { value } }); start();
  expect(processedRegion().getByRole('alert')).toHaveTextContent('1-100 rows'); expect(fetch).not.toHaveBeenCalled();
});

it('preserves configuration, source sample and processed evidence through width and data-mode changes', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({ batch: sourceBatch, truncated: false })).mockResolvedValueOnce(response(processed));
  vi.stubGlobal('fetch', fetch); render(<DesignerWorkbench />); const original = stringifyJson(usePipelineStore.getState().nodes);
  source(); await screen.findByLabelText('Typed preview records'); start(); await screen.findByLabelText('Processed typed preview records');
  fireEvent.click(screen.getByRole('button', { name: '展开数据' }));
  fireEvent.click(screen.getByRole('button', { name: '返回配置' }));
  expect(screen.getByLabelText('Processed typed preview records').textContent).toBe(stringifyJson(batch.records, 2));
  expect(screen.getByLabelText('Typed preview records').textContent).toBe(stringifyJson(sourceBatch.records, 2));
  expect(stringifyJson(usePipelineStore.getState().nodes)).toBe(original); expect(fetch).toHaveBeenCalledTimes(2);
});

it('rejects a chain over the backend eight-processor bound before dispatch', () => {
  const state = usePipelineStore.getState();
  const processors = Array.from({ length: 9 }, (_, index) => ({ ...node(`map-${index}`, 'processor', 'records'), data: { ...node(`map-${index}`, 'processor', 'records').data, componentId: 'mapping' } }));
  const chain = [state.nodes.find((n) => n.id === 'source')!, ...processors, state.nodes.find((n) => n.id === 'sink')!];
  usePipelineStore.setState({ nodes: chain, edges: chain.slice(1).map((n, index) => edge(chain[index].id, n.id)) });
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); render(<DesignerWorkbench />);
  expect(screen.getByRole('button', { name: 'Preview processed data' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Check compatibility' })).toBeDisabled();
  expect(screen.getAllByText(/最多 8 个处理组件/).length).toBeGreaterThan(0);
  expect(fetch).not.toHaveBeenCalled();
});

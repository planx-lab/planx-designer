import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfigPanel } from './ConfigPanel';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { parseJson, stringifyJson } from '@/lib/json';

const typedBatch = {
  schema: { fields: [
    { name: 'id', kind: 'int64', nullable: false },
    { name: 'amount', kind: 'decimal', nullable: true, precision: 38, scale: 18 },
    { name: 'missing', kind: 'string', nullable: true },
    { name: 'nullValue', kind: 'string', nullable: true },
    { name: 'empty', kind: 'string', nullable: false },
    { name: 'instant', kind: 'timestamp', nullable: false },
    { name: 'civil', kind: 'datetime', nullable: false },
    { name: 'nested', kind: 'struct', nullable: false, fields: [{ name: 'label', kind: 'string', nullable: false }] },
    { name: 'list', kind: 'list', nullable: false, element: { name: 'item', kind: 'uint64', nullable: false } },
  ] },
  records: [{
    id: { kind: 'int64', present: true, null: false, data: '9007199254740993' },
    amount: { kind: 'decimal', present: true, null: false, data: { coefficient: '12345678901234567890123456789012345678', exponent: -18 } },
    missing: { kind: 'string', present: false, null: false },
    nullValue: { kind: 'string', present: true, null: true },
    empty: { kind: 'string', present: true, null: false, data: '' },
    instant: { kind: 'timestamp', present: true, null: false, data: '2026-09-09T01:02:03.123456789Z' },
    civil: { kind: 'datetime', present: true, null: false, data: '2026-09-09T01:02:03.123456789' },
    nested: { kind: 'struct', present: true, null: false, data: { label: { kind: 'string', present: true, null: false, data: '\u6c49\u5b57' } } },
    list: { kind: 'list', present: true, null: false, data: [{ kind: 'uint64', present: true, null: false, data: '18446744073709551615' }] },
  }],
};

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function openPanel({ capability = true, tenantId = 'reference', kind = 'source' }: {
  capability?: boolean | null; tenantId?: string; kind?: 'source' | 'sink';
} = {}) {
  usePipelineStore.getState().reset(tenantId);
  usePipelineStore.setState({
    nodes: [{
      id: 'read', type: 'pipelineNode', position: { x: 0, y: 0 },
      data: {
        nodeType: kind, name: 'read', pluginId: 'sqlserver', componentId: kind, pluginLabel: 'SQL Server', isValid: true,
        config: parseJson('{"connection_ref":"source","table":"reference.source_records","large":9007199254740993,"decimal":123456789.012345678900}') as Record<string, unknown>,
      },
    }], edges: [], tenantId,
  });
  useUIStore.setState({ selectedNodeId: 'read', tenantId });
  usePaletteStore.setState({ plugins: [{
    id: 'sqlserver', displayName: 'SQL Server', version: '1', components: [{
      id: kind, kind, displayName: 'Source',
      configSchema: { fields: [{ name: 'table', type: 'STRING', label: 'Table' }] },
      operations: capability === null ? undefined : { testConnection: false, checkCompatibility: false, preview: capability },
    }],
  }] });
  render(<ConfigPanel />);
}

function startPreview() { fireEvent.click(screen.getByRole('button', { name: 'Preview source data', exact: true })); }

it('requires an explicit click and sends default budgets without saving any resource or config', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(stringifyJson({ batch: typedBatch, truncated: false })));
  vi.stubGlobal('fetch', fetch);
  openPanel();
  const original = stringifyJson(usePipelineStore.getState().nodes[0].data.config);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Maximum preview rows')).toHaveValue(20);
  expect(screen.getByLabelText('Maximum preview bytes')).toHaveValue(65536);
  startPreview();
  await screen.findByLabelText('Typed preview records');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('/api/plugins/preview');
  expect(parseJson(fetch.mock.calls[0][1].body)).toMatchObject({ tenantId: 'reference', pluginId: 'sqlserver', componentId: 'source', maxRows: 20, maxBytes: 65536 });
  expect(fetch.mock.calls[0][1].body).toContain('"large":9007199254740993');
  expect(fetch.mock.calls[0][1].body).toContain('"decimal":123456789.012345678900');
  expect(stringifyJson(usePipelineStore.getState().nodes[0].data.config)).toBe(original);
});

it('displays actual typed schema and records without normalizing precision, presence or temporal text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stringifyJson({ batch: typedBatch, truncated: false }))));
  openPanel();
  startPreview();
  const records = await screen.findByLabelText('Typed preview records');
  expect(records.textContent).toBe(stringifyJson(typedBatch.records, 2));
  expect(screen.getByLabelText('Preview record.Schema').textContent).toBe(stringifyJson(typedBatch.schema, 2));
  expect(records).toHaveTextContent('9007199254740993');
  expect(records).toHaveTextContent('18446744073709551615');
  expect(records).toHaveTextContent('12345678901234567890123456789012345678');
  expect(records).toHaveTextContent('2026-09-09T01:02:03.123456789Z');
  expect(screen.getByText(/Missing is not NULL; an empty string is present/)).toBeInTheDocument();
  expect(screen.getByText('1 preview record')).toBeInTheDocument();
});

it.each([
  [null, 'Source preview unavailable (not advertised).'],
  [false, 'Source preview unsupported by this component.'],
] as const)('does not infer a source preview hook from catalog presence: %s', (capability, message) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  openPanel({ capability });
  expect(screen.getByRole('button', { name: 'Preview source data' })).toBeDisabled();
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it('never offers data preview for a sink component', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  openPanel({ kind: 'sink' });
  expect(screen.queryByRole('button', { name: 'Preview source data' })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it('requires tenant context before preview requests', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  openPanel({ tenantId: '' });
  expect(screen.getByRole('button', { name: 'Preview source data' })).toBeDisabled();
  expect(screen.getByText('Tenant context is required for source preview.')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  [501, 'Source preview unsupported by server (501).'],
  [422, 'Preview redacted: sensitive schema fields prevented the entire result from being returned. Select safe fields explicitly.'],
  [413, 'Preview budget exceeded. Adjust limits or selected fields.'],
  [504, 'Source preview timed out (10-second bound).'],
  [408, 'Source preview cancelled by server.'],
  [502, 'Source preview failed; no data is shown.'],
] as const)('handles HTTP %s without leaking raw driver errors or fabricating rows', async (status, message) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"DO_NOT_DISPLAY_raw_driver_payload","code":"fixture_error"}', { status })));
  openPanel();
  startPreview();
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.queryByText(/DO_NOT_DISPLAY/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Typed preview records')).not.toBeInTheDocument();
});

it.each([
  ['Maximum preview rows', '0'], ['Maximum preview rows', '101'], ['Maximum preview rows', '1.5'],
  ['Maximum preview bytes', '1048577'], ['Maximum preview bytes', ''],
])('rejects invalid explicit budgets before network access: %s=%s', (label, value) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  openPanel();
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  startPreview();
  expect(screen.getByText('Use whole-number limits: 1-100 rows and 1-1048576 bytes.')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it('cancels an active request and ignores a late successful response', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
  vi.stubGlobal('fetch', fetch);
  openPanel();
  startPreview();
  const signal = fetch.mock.calls[0][1].signal as AbortSignal;
  fireEvent.click(screen.getByRole('button', { name: 'Cancel preview' }));
  expect(signal.aborted).toBe(true);
  expect(screen.getByText('Preview cancelled. No execution or ACK was requested.')).toBeInTheDocument();
  await act(async () => resolve(new Response(stringifyJson({ batch: typedBatch, truncated: false }))));
  expect(screen.queryByLabelText('Typed preview records')).not.toBeInTheDocument();
});

it('aborts and discards an old preview when the node config changes', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
  vi.stubGlobal('fetch', fetch);
  openPanel();
  startPreview();
  const signal = fetch.mock.calls[0][1].signal as AbortSignal;
  fireEvent.change(screen.getByLabelText('Table'), { target: { value: 'reference.changed' } });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(new Response(stringifyJson({ batch: typedBatch, truncated: false }))));
  expect(screen.queryByLabelText('Typed preview records')).not.toBeInTheDocument();
});

it('does not claim an empty source when a byte-limited preview contains no complete rows', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stringifyJson({ batch: { schema: typedBatch.schema, records: [] }, truncated: true }))));
  openPanel();
  startPreview();
  expect(await screen.findByText('0 preview records')).toBeInTheDocument();
  expect(screen.getByText(/Truncated: limits may have stopped reading; additional rows are not guaranteed/)).toBeInTheDocument();
  expect(screen.queryByText(/source is empty/i)).not.toBeInTheDocument();
});

it('rejects an unrecognized result rather than treating it as a successful empty preview', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"batch":{"schema":{"fields":[]},"records":[]} }')));
  openPanel();
  startPreview();
  expect(await screen.findByText('Unrecognized preview response; no data is shown.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Typed preview records')).not.toBeInTheDocument();
});

it('removes a previous preview if a subsequent request fails', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(stringifyJson({ batch: typedBatch, truncated: false })))
    .mockRejectedValueOnce(new TypeError('offline')));
  openPanel();
  startPreview();
  await screen.findByLabelText('Typed preview records');
  startPreview();
  expect(await screen.findByText('Source preview request failed; no data is shown.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Typed preview records')).not.toBeInTheDocument();
});

it('keeps source preview identity separate from the operation panel', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    openPanel();
    expect(errors.mock.calls.flat().map(String).join(' ')).not.toMatch(/same key/);
  } finally {
    errors.mockRestore();
  }
});

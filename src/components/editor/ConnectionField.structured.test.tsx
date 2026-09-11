import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConnectionField } from './ConnectionField';
import { SchemaForm } from './SchemaForm';
import { useConnectionRevisionStore } from '@/stores/useConnectionRevisionStore';
import type { ConnectionImpact, ConnectionKind, ConnectionMutation, ConnectionResource } from '@/types/connection';

const profiles: ConnectionKind[] = [
  { kind: 'sample-db', fields: [
    { name: 'host', label: 'Host', required: true },
    { name: 'port', label: 'Port', required: true },
    { name: 'username', label: 'User name', required: true },
    { name: 'password', label: 'Password', secret: true, required: true },
    { name: 'headers', label: 'Headers JSON', secret: true, description: 'User-provided authentication headers.' },
    { name: 'mode', label: 'Mode', options: ['strict', 'permissive'] },
  ] },
  { kind: 'http', fields: [
    { name: 'base_url', label: 'Base URL', required: true },
    { name: 'allowed_endpoints', label: 'Allowed endpoints' },
    { name: 'headers', label: 'Authentication headers JSON', secret: true, required: true },
  ] },
];
const resource: ConnectionResource = {
  id: 'warehouse', tenantId: 'tenant-a', driver: 'sample-db', name: 'Warehouse',
  parameters: { host: 'db.local', port: '15432', username: 'reader' },
  revision: 'revision-1', runtimeRevision: 'runtime-1', version: 1, configuredSecrets: { password: true, headers: false }, ready: true,
};
const impact: ConnectionImpact = {
  runtimeChanged: true, token: 'impact-1',
  users: [{ id: 'running-1', kind: 'execution', pipelineId: 'orders', executionId: 'exec-1' }, { id: 'sample-1', kind: 'preview' }],
  pipelines: [{ id: 'orders', name: 'Orders pipeline' }, { id: 'inactive', name: 'Saved inactive pipeline' }],
};
const response = (value: unknown) => new Response(JSON.stringify(value));

function server(options: {
  resources?: ConnectionResource[];
  kinds?: ConnectionKind[];
  impact?: ConnectionImpact;
  onImpact?: (candidate: ConnectionMutation) => Promise<Response> | Response;
  onSave?: (candidate: ConnectionMutation) => Promise<Response> | Response;
  onQuery?: () => Promise<Response> | Response;
} = {}) {
  const fetch = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.endsWith('/healthz')) return response({ status: 'ok', pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v1' });
    if (url.includes('/connection-kinds?')) return response(options.kinds ?? profiles);
    if (url.includes('/connections?')) return response({ connections: options.resources ?? [resource] });
    if (url.endsWith('/impact')) return options.onImpact?.(JSON.parse(String(init?.body))) ?? response(options.impact ?? impact);
    if (init?.method === 'POST' || init?.method === 'PUT') {
      const candidate = JSON.parse(String(init.body)) as ConnectionMutation;
      return options.onSave?.(candidate) ?? response({
        ...resource, ...candidate.connection, revision: 'revision-2', runtimeRevision: 'runtime-2', version: 2,
      });
    }
    if (url.includes('/connections/')) return options.onQuery?.() ?? response(resource);
    throw new Error('Unexpected test request');
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function Field({ tenantId = 'tenant-a', value = 'warehouse', driver, onChange = () => {} }: {
  tenantId?: string; value?: string; driver?: string; onChange?: (id: string) => void;
}) {
  return <><label htmlFor="connection">Connection</label><ConnectionField id="connection" tenantId={tenantId} driver={driver} value={value} onChange={onChange} /></>;
}
const saveCalls = (fetch: ReturnType<typeof server>) => fetch.mock.calls.filter(([url, init]) =>
  (init?.method === 'POST' || init?.method === 'PUT') && !url.endsWith('/impact'));
async function newEditor() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'New connection' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'New connection' }));
  await screen.findByRole('option', { name: 'sample-db', exact: true });
  fireEvent.change(screen.getByLabelText('Connection ID'), { target: { value: 'warehouse' } });
  fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: 'Warehouse' } });
  fireEvent.change(screen.getByLabelText('Connection kind'), { target: { value: 'sample-db' } });
}
async function editEditor() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit connection' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Edit connection' }));
  await screen.findByLabelText('Host (required)');
}
function fillNew() {
  fireEvent.change(screen.getByLabelText('Host (required)'), { target: { value: 'db.local' } });
  fireEvent.change(screen.getByLabelText('Port (required)'), { target: { value: '15432' } });
  fireEvent.change(screen.getByLabelText('User name (required)'), { target: { value: 'reader' } });
  fireEvent.change(screen.getByLabelText('Password new value'), { target: { value: 'synthetic-password' } });
}
const submit = () => fireEvent.submit(screen.getByRole('form', { name: 'Connection settings' }));

beforeEach(() => useConnectionRevisionStore.setState({ revisions: {}, fingerprints: {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Catalog-driven local connection editor', () => {
  it('creates structured user credentials without environment names, defaults or persistent secrets', async () => {
    const fetch = server({ resources: [] }); const onChange = vi.fn();
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    render(<Field value="" onChange={onChange} />); await newEditor();
    expect(screen.getByLabelText('Port (required)')).toHaveValue('');
    expect(screen.getByLabelText('Mode')).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'Keep stored credential' })).not.toBeInTheDocument();
    submit();
    await screen.findByText('Enter a valid value for Host.');
    expect(saveCalls(fetch)).toHaveLength(0);
    fillNew(); submit();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('warehouse'));
    expect(saveCalls(fetch)).toHaveLength(1);
    const [url, init] = saveCalls(fetch)[0];
    expect(url).toBe('/api/connections');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      connection: { id: 'warehouse', tenantId: 'tenant-a', driver: 'sample-db', name: 'Warehouse', parameters: resource.parameters },
      secrets: { password: { action: 'replace', value: 'synthetic-password' }, headers: { action: 'clear' } },
    });
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(JSON.stringify(useConnectionRevisionStore.getState())).not.toContain('synthetic-password');
    expect(persist).not.toHaveBeenCalled();
    expect(fetch.mock.calls.some(([request]) => /run|preview|test-connection/.test(request))).toBe(false);
  });

  it('shows configured flags, stable identity and explicit keep/replace/clear without masked values', async () => {
    server({ resources: [{ ...resource, configuredSecrets: { password: true, headers: true } }] });
    render(<Field />); await editEditor();
    expect(screen.getByLabelText('Connection ID')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Connection kind')).toBeDisabled();
    expect(screen.getByLabelText('Password action')).toHaveValue('keep');
    expect(screen.queryByLabelText('Password new value')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Password action'), { target: { value: 'replace' } });
    expect(screen.getByLabelText('Password new value')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Password new value'), { target: { value: 'temporary-only' } });
    fireEvent.change(screen.getByLabelText('Password action'), { target: { value: 'keep' } });
    fireEvent.change(screen.getByLabelText('Password action'), { target: { value: 'replace' } });
    expect(screen.getByLabelText('Password new value')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Headers JSON action'), { target: { value: 'clear' } });
    expect(screen.getByLabelText('Headers JSON action')).toHaveValue('clear');
  });

  it('renders secret JSON headers generically and clears incompatible fields when the kind changes', async () => {
    const fetch = server({ resources: [] }); render(<Field value="" />); await newEditor(); fillNew();
    fireEvent.change(screen.getByLabelText('Connection kind'), { target: { value: 'http' } });
    expect(screen.queryByLabelText('Host (required)')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Base URL (required)'), { target: { value: 'https://example.invalid' } });
    const headers = '{"Authorization":"Bearer synthetic","X-Route":"test"}';
    fireEvent.change(screen.getByLabelText('Authentication headers JSON new value'), { target: { value: headers } });
    submit();
    await waitFor(() => expect(saveCalls(fetch)).toHaveLength(1));
    const body = JSON.parse(String(saveCalls(fetch)[0][1]?.body));
    expect(body.connection.parameters).toEqual({ base_url: 'https://example.invalid' });
    expect(body.secrets).toEqual({ headers: { action: 'replace', value: headers } });
    expect(String(saveCalls(fetch)[0][1]?.body)).not.toContain('synthetic-password');
  });

  it('reviews saved pipelines and actual users before an explicit stop/apply with the same token', async () => {
    const fetch = server(); render(<Field />); await editEditor();
    fireEvent.change(screen.getByLabelText('Host (required)'), { target: { value: 'new-db.local' } });
    expect(saveCalls(fetch)).toHaveLength(0);
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/impact'))).toBe(false);
    submit();
    const region = await screen.findByRole('region', { name: 'Connection change impact' });
    expect(within(region).getByText('Saved inactive pipeline (inactive)')).toBeInTheDocument();
    expect(within(region).getByText(/execution: running-1/)).toBeInTheDocument();
    expect(within(region).getByText('preview: sample-1')).toBeInTheDocument();
    expect(saveCalls(fetch)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Stop affected users and apply' }));
    await waitFor(() => expect(saveCalls(fetch)).toHaveLength(1));
    expect(JSON.parse(String(saveCalls(fetch)[0][1]?.body))).toMatchObject({
      expectedRevision: 'revision-1', impactToken: 'impact-1', stopAffected: true,
      connection: { parameters: { host: 'new-db.local' } }, secrets: { password: { action: 'keep' } },
    });
  });

  it('does not stop actual users for a display-only edit', async () => {
    const fetch = server({ impact: { ...impact, runtimeChanged: false } }); render(<Field />); await editEditor();
    fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: 'Renamed' } }); submit();
    await screen.findByText('Display-only change. Running work will not be stopped.');
    expect(screen.queryByRole('button', { name: 'Stop affected users and apply' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(saveCalls(fetch)).toHaveLength(1));
    expect(JSON.parse(String(saveCalls(fetch)[0][1]?.body))).toMatchObject({ expectedRevision: 'revision-1', stopAffected: false, impactToken: 'impact-1' });
  });

  it('invalidates a reviewed impact when a field changes', async () => {
    const fetch = server(); render(<Field />); await editEditor(); submit();
    await screen.findByRole('button', { name: 'Stop affected users and apply' });
    fireEvent.change(screen.getByLabelText('Host (required)'), { target: { value: 'later-edit.local' } });
    expect(screen.queryByRole('region', { name: 'Connection change impact' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled();
    expect(saveCalls(fetch)).toHaveLength(0);
  });

  it('rejects a stale editor revision without applying or leaking raw backend errors', async () => {
    const fetch = server({ onImpact: () => new Response('raw-secret-must-not-display', { status: 409 }) });
    render(<Field />); await editEditor();
    fireEvent.change(screen.getByLabelText('Host (required)'), { target: { value: 'preserved.local' } }); submit();
    await screen.findByText(/editor-base revision is stale/);
    expect(screen.getByLabelText('Host (required)')).toHaveValue('preserved.local');
    expect(screen.queryByText(/raw-secret-must-not-display/)).not.toBeInTheDocument();
    expect(saveCalls(fetch)).toHaveLength(0);
    const call = fetch.mock.calls.find(([url]) => url.endsWith('/impact'));
    expect(JSON.parse(String(call?.[1]?.body)).expectedRevision).toBe('revision-1');
  });

  it('does not replay an apply when new actual users invalidate its impact', async () => {
    const fetch = server({ onSave: () => new Response('changed impact', { status: 409 }) });
    render(<Field />); await editEditor(); submit();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop affected users and apply' }));
    await screen.findByText(/Nothing was automatically replayed/);
    expect(saveCalls(fetch)).toHaveLength(1);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/impact'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled();
  });

  it('reports an unknown save, clears secret inputs, and queries without silently replaying or replacing the draft', async () => {
    const fetch = server({
      resources: [], onSave: () => Promise.reject(new TypeError('lost response')),
      onQuery: () => response({ ...resource, name: 'Committed name', revision: 'revision-2' }),
    });
    const onChange = vi.fn(); render(<Field value="" onChange={onChange} />); await newEditor(); fillNew(); submit();
    await screen.findByText(/Save outcome unknown/);
    expect(screen.getByRole('button', { name: 'Save connection' })).toBeDisabled();
    expect(screen.getByLabelText('Password new value')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Query saved connection' }));
    const result = await screen.findByRole('region', { name: 'Current saved connection' });
    expect(within(result).getByText('revision-2')).toBeInTheDocument();
    expect(screen.getByLabelText('Connection name')).toHaveValue('Warehouse');
    expect(saveCalls(fetch)).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace draft with saved revision' }));
    expect(screen.getByLabelText('Connection name')).toHaveValue('Committed name');
    expect(screen.getByText('Editor revision: revision-2')).toBeInTheDocument();
    expect(screen.getByLabelText('Password action')).toHaveValue('keep');
    expect(saveCalls(fetch)).toHaveLength(1);
  });

  it('does not treat a missing query result as permission to retry an uncertain create', async () => {
    const fetch = server({ resources: [], onSave: () => Promise.reject(new TypeError('lost')), onQuery: () => new Response('missing', { status: 404 }) });
    render(<Field value="" />); await newEditor(); fillNew(); submit();
    await screen.findByText(/Save outcome unknown/);
    fireEvent.click(screen.getByRole('button', { name: 'Query saved connection' }));
    await screen.findByText(/does not prove an earlier save failed/);
    expect(screen.getByRole('button', { name: 'Save connection' })).toBeDisabled();
    expect(saveCalls(fetch)).toHaveLength(1);
  });

  it('drops credentials and ignores a late save after the tenant switches', async () => {
    let finish!: (value: Response) => void;
    const fetch = server({ resources: [], onSave: () => new Promise<Response>((resolve) => { finish = resolve; }) });
    const onChange = vi.fn(); const { rerender } = render(<Field value="" onChange={onChange} />);
    await newEditor(); fillNew(); submit();
    await waitFor(() => expect(saveCalls(fetch)).toHaveLength(1));
    rerender(<Field tenantId="tenant-b" value="" onChange={onChange} />);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    await act(async () => finish(response(resource)));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue('synthetic-password')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Warehouse (sample-db)' })).not.toBeInTheDocument();
  });

  it('keeps a newer selection and its editor when an old save completes in the same tenant and driver', async () => {
    const other: ConnectionResource = {
      ...resource, id: 'other-warehouse', name: 'Other warehouse',
      parameters: { ...resource.parameters, host: 'other-db.local' },
      revision: 'other-revision', runtimeRevision: 'other-runtime',
    };
    let finish!: (value: Response) => void;
    const fetch = server({
      resources: [resource, other], impact: { ...impact, users: [] },
      onSave: () => new Promise<Response>((resolve) => { finish = resolve; }),
    });
    const onChange = vi.fn();
    const { rerender } = render(<Field value="warehouse" driver="sample-db" onChange={onChange} />);
    await editEditor();
    fireEvent.change(screen.getByLabelText('Password action'), { target: { value: 'replace' } });
    fireEvent.change(screen.getByLabelText('Password new value'), { target: { value: 'old-selection-only' } });
    submit();
    fireEvent.click(await screen.findByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(saveCalls(fetch)).toHaveLength(1));
    expect(JSON.parse(String(saveCalls(fetch)[0][1]?.body))).toMatchObject({
      connection: { id: 'warehouse' }, expectedRevision: 'revision-1',
      impactToken: 'impact-1', stopAffected: false,
    });

    rerender(<Field value="other-warehouse" driver="sample-db" onChange={onChange} />);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    await screen.findByRole('option', { name: 'Other warehouse (sample-db)' });
    expect(screen.getByLabelText('Connection')).toHaveValue('other-warehouse');
    await editEditor();
    fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: 'Keep this newer edit' } });
    fireEvent.change(screen.getByLabelText('Password action'), { target: { value: 'replace' } });
    fireEvent.change(screen.getByLabelText('Password new value'), { target: { value: 'new-selection-only' } });

    await act(async () => finish(response({
      ...resource, revision: 'old-save-completed', runtimeRevision: 'old-save-runtime', version: 2,
    })));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Connection')).toHaveValue('other-warehouse');
    expect(screen.getByLabelText('Connection ID')).toHaveValue('other-warehouse');
    expect(screen.getByText('Editor revision: other-revision')).toBeInTheDocument();
    expect(screen.getByLabelText('Connection name')).toHaveValue('Keep this newer edit');
    expect(screen.getByLabelText('Password new value')).toHaveValue('new-selection-only');
    expect(screen.queryByDisplayValue('old-selection-only')).not.toBeInTheDocument();
    expect(saveCalls(fetch)).toHaveLength(1);
  });

  it('discards a closed local form rather than bringing its credentials into a new editor', async () => {
    server({ resources: [] }); render(<Field value="" />); await newEditor(); fillNew();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await newEditor();
    expect(screen.getByLabelText('Password new value')).toHaveValue('');
    expect(screen.getByLabelText('Host (required)')).toHaveValue('');
  });

  it('completes an existing migration row using the same structured editor and identity', async () => {
    const legacy = { ...resource, ready: false, migrationRequired: true, parameters: {}, configuredSecrets: {} };
    const fetch = server({ resources: [legacy] }); render(<Field />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete setup' }));
    await screen.findByLabelText('Host (required)');
    expect(screen.getByLabelText('Connection ID')).toHaveValue('warehouse');
    expect(screen.getByLabelText('Connection ID')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Password new value')).toHaveValue('');
    expect(screen.queryByLabelText(/environment variable/i)).not.toBeInTheDocument();
    fillNew(); submit();
    await screen.findByRole('region', { name: 'Connection change impact' });
    const call = fetch.mock.calls.find(([url]) => url.endsWith('/impact'));
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ connection: { id: 'warehouse' }, expectedRevision: 'revision-1' });
    expect(saveCalls(fetch)).toHaveLength(0);
  });

  it('requires tenant scope before any listing or editor request', () => {
    const fetch = server(); render(<Field tenantId="" value="" />);
    expect(screen.getByLabelText('Connection')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'New connection' })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows table, view and unknown kinds while retaining the same qualified object value', () => {
    const onChange = vi.fn(); const discovered = vi.fn();
    render(<SchemaForm schema={{ fields: [{ name: 'table', type: 'STRING', label: 'Object' }] }} value={{ table: 'public.orders' }} onChange={onChange}
      tables={[{ schema: 'public', name: 'orders', kind: 'TABLE' }, { schema: 'reporting', name: 'daily', kind: 'VIEW' }, { schema: 'external', name: 'legacy' }]}
      onTableChange={discovered} />);
    expect(screen.getByRole('option', { name: 'public.orders (Table)' })).toHaveValue('public.orders');
    expect(screen.getByRole('option', { name: 'reporting.daily (View)' })).toHaveValue('reporting.daily');
    expect(screen.getByRole('option', { name: 'external.legacy (Unknown kind)' })).toHaveValue('external.legacy');
    fireEvent.change(screen.getByLabelText('Object'), { target: { value: 'reporting.daily' } });
    expect(onChange).toHaveBeenCalledWith({ table: 'reporting.daily' });
    expect(discovered).toHaveBeenCalledWith('reporting.daily');
  });
});

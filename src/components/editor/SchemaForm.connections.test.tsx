import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { parse, stringify } from 'lossless-json';
import { SchemaForm } from './SchemaForm';
import type { ConnectionKind, ConnectionResource } from '@/types/connection';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const schema = { fields: [{ name: 'connection_ref', type: 'STRING' as const, label: 'Connection' }] };
const resource: ConnectionResource = {
  id: 'warehouse', tenantId: 'tenant-a', driver: 'postgres', name: 'warehouse',
  parameters: { host: 'warehouse.test', database: 'warehouse', username: 'reader' },
  revision: 'editor-1', runtimeRevision: 'runtime-1', version: 1,
  configuredSecrets: { password: true }, ready: true,
};
const kinds: ConnectionKind[] = [{ kind: 'postgres', fields: [
  { name: 'host', label: 'Host', required: true },
  { name: 'database', label: 'Database', required: true },
  { name: 'username', label: 'User name', required: true },
  { name: 'password', label: 'Password', secret: true, required: true },
] }];
const response = (value: unknown) => new Response(JSON.stringify(value));
const health = () => response({ status: 'ok', pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v1' });

function Form({ tenantId = 'tenant-a' }: { tenantId?: string }) {
  const [value, setValue] = useState(parse('{"amount":123456789.012345678900}') as Record<string, unknown>);
  return <>
    <SchemaForm schema={schema} value={value} onChange={setValue} tenantId={tenantId} />
    <output aria-label="Config JSON">{stringify(value)}</output>
  </>;
}

it('selects only tenant resources and preserves the rest of the exact config', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(response({ connections: [
    resource, { ...resource, id: 'other-tenant-only', tenantId: 'tenant-b' },
  ] })));
  vi.stubGlobal('fetch', fetch);
  render(<Form />);
  await screen.findByRole('option', { name: /warehouse/ });
  expect(screen.queryByRole('option', { name: /other-tenant-only/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Connection' }), { target: { value: 'warehouse' } });
  expect(screen.getByLabelText('Config JSON')).toHaveTextContent('{"amount":123456789.012345678900,"connection_ref":"warehouse"}');
  expect(fetch.mock.calls[0][0]).toContain('/connections?tenantId=tenant-a');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit connection' })).toBeEnabled());
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('requires a tenant before listing or creating a connection', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(<Form tenantId="" />);
  expect(screen.getByRole('combobox', { name: 'Connection' })).toBeDisabled();
  expect(screen.getByText(/tenant context is required/i)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it('creates structured credentials, then selects the returned tenant resource without putting secrets in pipeline config', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response({ connections: [] }))
    .mockResolvedValueOnce(health())
    .mockResolvedValueOnce(response(kinds))
    .mockResolvedValueOnce(health())
    .mockResolvedValueOnce(response(resource))
    .mockResolvedValueOnce(response({ connections: [resource] }))
    .mockResolvedValueOnce(health())
    .mockResolvedValueOnce(response(kinds));
  vi.stubGlobal('fetch', fetch);
  const { container } = render(<Form />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'New connection' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'New connection' }));
  await screen.findByRole('option', { name: 'postgres', exact: true });
  fireEvent.change(screen.getByLabelText('Connection ID'), { target: { value: 'warehouse' } });
  fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: 'warehouse' } });
  fireEvent.change(screen.getByLabelText('Connection kind'), { target: { value: 'postgres' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Connection settings' }));
  await screen.findByText('Enter a valid value for Host.');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(container.querySelector('input[type="password"]')).not.toBeNull();
  fireEvent.change(screen.getByLabelText('Host (required)'), { target: { value: 'warehouse.test' } });
  fireEvent.change(screen.getByLabelText('Database (required)'), { target: { value: 'warehouse' } });
  fireEvent.change(screen.getByLabelText('User name (required)'), { target: { value: 'reader' } });
  fireEvent.change(screen.getByLabelText('Password new value'), { target: { value: 'synthetic-local-password' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Connection settings' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Connection' })).toHaveValue('warehouse'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit connection' })).toBeEnabled());
  expect(fetch).toHaveBeenCalledTimes(6);
  expect(JSON.parse(fetch.mock.calls[4][1].body)).toEqual({
    connection: {
      id: 'warehouse', tenantId: 'tenant-a', driver: 'postgres', name: 'warehouse',
      parameters: { host: 'warehouse.test', database: 'warehouse', username: 'reader' },
    },
    secrets: { password: { action: 'replace', value: 'synthetic-local-password' } },
  });
  expect(screen.getByLabelText('Config JSON')).toHaveTextContent('{"amount":123456789.012345678900,"connection_ref":"warehouse"}');
  expect(screen.getByLabelText('Config JSON')).not.toHaveTextContent('synthetic-local-password');
  expect(fetch.mock.calls.some(([url]) => /preview|test-connection|\/run/.test(String(url)))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Edit connection' }));
  await screen.findByLabelText('Host (required)');
  expect(screen.getByLabelText('Connection ID')).toHaveValue('warehouse');
  expect(screen.getByLabelText('Connection ID')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Host (required)')).toHaveValue('warehouse.test');
  expect(screen.getByLabelText('Password action')).toHaveValue('keep');
  expect(screen.queryByLabelText('Password new value')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(8);
});

it('does not expose a previous tenant response after the tenant changes', async () => {
  let resolveOld!: (response: Response) => void;
  const fetch = vi.fn()
    .mockReturnValueOnce(new Promise<Response>((resolve) => { resolveOld = resolve; }))
    .mockResolvedValueOnce(response({ connections: [] }));
  vi.stubGlobal('fetch', fetch);
  const { rerender } = render(<Form />);
  rerender(<Form tenantId="tenant-b" />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await act(async () => resolveOld(response({ connections: [resource] })));
  expect(screen.queryByRole('option', { name: /warehouse/ })).not.toBeInTheDocument();
  expect(fetch.mock.calls[1][0]).toContain('tenantId=tenant-b');
});

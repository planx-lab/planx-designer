import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfigPanel } from './ConfigPanel';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { useUIStore } from '@/stores/useUIStore';
import type { ConnectionKind, ConnectionResource } from '@/types/connection';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const fileResource: ConnectionResource = {
  id: 'csv-root', tenantId: 'reference', driver: 'file', name: 'csv-root',
  parameters: { root: '/synthetic/csv-root' }, revision: 'file-editor-2', runtimeRevision: 'file-runtime-2',
  version: 2, configuredSecrets: {}, ready: true,
};
const dbResource: ConnectionResource = {
  ...fileResource, id: 'database', driver: 'postgres', name: 'database',
  parameters: { host: 'database.test', database: 'reference' },
  revision: 'db-editor-2', runtimeRevision: 'db-runtime-2', configuredSecrets: { password: true },
};
const kinds: ConnectionKind[] = [
  { kind: 'file', fields: [{ name: 'root', label: 'Trusted root', required: true, description: 'Saving stores this root; it does not open a directory.' }] },
  { kind: 'postgres', fields: [
    { name: 'host', label: 'Host', required: true }, { name: 'database', label: 'Database', required: true },
    { name: 'password', label: 'Password', secret: true, required: true },
  ] },
];
const response = (value: unknown) => new Response(JSON.stringify(value));
const health = () => response({ status: 'ok', pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v1' });

function openPanel(kind: 'source' | 'sink' = 'source', pluginId = 'csv', connection_ref = '') {
  usePipelineStore.getState().reset('reference');
  usePipelineStore.setState({ nodes: [{
    id: 'node', type: 'pipelineNode', position: { x: 0, y: 0 },
    data: {
      name: 'node', nodeType: kind, pluginId, componentId: kind,
      pluginLabel: pluginId, isValid: true, config: { connection_ref, path: 'nested/data.csv' },
    },
  }] });
  useUIStore.setState({ selectedNodeId: 'node' });
  usePaletteStore.setState({ plugins: [{
    id: pluginId, version: '1', displayName: pluginId, origin: 'builtin',
    components: [{ id: kind, kind, displayName: kind, configSchema: { fields: [
      { name: 'connection_ref', type: 'STRING', label: 'Connection', required: true },
      { name: 'path', type: 'STRING', label: 'Path' },
    ] } }],
  }] });
  render(<ConfigPanel />);
}

it.each(['source', 'sink'] as const)('filters CSV %s connections by tenant and file driver without replacing an existing reference', async (kind) => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(response({ connections: [
    fileResource, dbResource, { ...fileResource, id: 'other-tenant-root', tenantId: 'other' },
  ] })));
  vi.stubGlobal('fetch', fetch);
  openPanel(kind, 'csv', 'database');
  await screen.findByRole('option', { name: 'csv-root (file)' });
  expect(screen.queryByRole('option', { name: 'database (postgres)' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /other-tenant-root/ })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'database (not available)' })).toBeDisabled();
  expect(usePipelineStore.getState().nodes[0].data.config.connection_ref).toBe('database');
  expect(screen.queryByRole('button', { name: 'Edit connection' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: /Connection/ }), { target: { value: 'csv-root' } });
  expect(usePipelineStore.getState().nodes[0].data.config).toEqual({ connection_ref: 'csv-root', path: 'nested/data.csv' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit connection' })).toBeEnabled());
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][0]).toContain('/connections?tenantId=reference');
});

it('creates a structured file connection from Catalog fields without starting a file operation', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response({ connections: [] }))
    .mockResolvedValueOnce(health())
    .mockResolvedValueOnce(response(kinds))
    .mockResolvedValueOnce(health())
    .mockResolvedValueOnce(response(fileResource))
    .mockResolvedValueOnce(response({ connections: [fileResource] }))
    .mockResolvedValueOnce(health())
    .mockResolvedValueOnce(response(kinds));
  vi.stubGlobal('fetch', fetch);
  openPanel();
  await waitFor(() => expect(screen.getByRole('button', { name: 'New connection' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'New connection' }));
  await screen.findByLabelText('Trusted root (required)');
  expect(screen.getByRole('combobox', { name: 'Connection kind' })).toHaveValue('file');
  expect(screen.getByRole('combobox', { name: 'Connection kind' })).toBeDisabled();
  expect(screen.getByText(/does not open a directory/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/environment variable/i)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Connection ID'), { target: { value: 'csv-root' } });
  fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: 'csv-root' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Connection settings' }));
  await screen.findByText('Enter a valid value for Trusted root.');
  expect(fetch).toHaveBeenCalledTimes(3);
  fireEvent.change(screen.getByLabelText('Trusted root (required)'), { target: { value: '/synthetic/csv-root' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Connection settings' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: /^Connection\s*\*?$/ })).toHaveValue('csv-root'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit connection' })).toBeEnabled());
  expect(fetch).toHaveBeenCalledTimes(6);
  expect(fetch.mock.calls[4][0]).toMatch(/\/connections$/);
  expect(fetch.mock.calls[4][1].method).toBe('POST');
  expect(JSON.parse(fetch.mock.calls[4][1].body)).toEqual({
    connection: { id: 'csv-root', tenantId: 'reference', driver: 'file', name: 'csv-root', parameters: { root: '/synthetic/csv-root' } },
    secrets: {},
  });
  expect(usePipelineStore.getState().nodes[0].data.config).toEqual({ connection_ref: 'csv-root', path: 'nested/data.csv' });
  expect(fetch.mock.calls.some(([url]) => /preview|discover-schema|test-connection|\/run/.test(String(url)))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Edit connection' }));
  await screen.findByLabelText('Trusted root (required)');
  expect(screen.getByLabelText('Trusted root (required)')).toHaveValue('/synthetic/csv-root');
  expect(fetch).toHaveBeenCalledTimes(8);
});

it('offers only Catalog kinds and their applicable fields without changing existing resource filtering', async () => {
  const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(
    url.endsWith('/healthz') ? health() : response(
      url.includes('/connection-kinds?') ? kinds : { connections: [dbResource, fileResource] },
    ),
  ));
  vi.stubGlobal('fetch', fetch);
  openPanel('source', 'postgres', 'database');
  await screen.findByRole('option', { name: 'database (postgres)' });
  fireEvent.click(screen.getByRole('button', { name: 'New connection' }));
  await screen.findByRole('option', { name: 'file', exact: true });
  const driver = screen.getByRole('combobox', { name: 'Connection kind' });
  expect(driver).toBeEnabled();
  fireEvent.change(driver, { target: { value: 'file' } });
  expect(screen.getByLabelText('Trusted root (required)')).toBeInTheDocument();
  fireEvent.change(driver, { target: { value: 'postgres' } });
  expect(screen.getByLabelText('Host (required)')).toBeInTheDocument();
  expect(screen.queryByLabelText('Trusted root (required)')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(3);
});

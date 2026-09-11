import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfigPanel } from './ConfigPanel';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { useUIStore } from '@/stores/useUIStore';
import type { ConfigField } from '@/types/plugin';
import type { ConnectionKind, ConnectionResource } from '@/types/connection';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const tenantId = 'driver-projection';
const resources: ConnectionResource[] = [
  {
    id: 'pg-ref', tenantId, driver: 'postgres', name: 'PG fixture',
    parameters: { host: 'pg-fixture.invalid' }, revision: 'pg-editor-1',
    runtimeRevision: 'pg-runtime-1', version: 1, configuredSecrets: { password: true }, ready: true,
  },
  {
    id: 'file-ref', tenantId, driver: 'file', name: 'File fixture',
    parameters: { directory: '/synthetic/driver-projection' }, revision: 'file-editor-1',
    runtimeRevision: 'file-runtime-1', version: 1, configuredSecrets: {}, ready: true,
  },
  {
    id: 'mysql-ref', tenantId, driver: 'mysql', name: 'MySQL fixture',
    parameters: { host: 'mysql-fixture.invalid' }, revision: 'mysql-editor-1',
    runtimeRevision: 'mysql-runtime-1', version: 1, configuredSecrets: { password: true }, ready: true,
  },
  {
    id: 'foreign-pg', tenantId: 'another-tenant', driver: 'postgres', name: 'Foreign PG fixture',
    parameters: { host: 'foreign-fixture.invalid' }, revision: 'foreign-editor-1',
    runtimeRevision: 'foreign-runtime-1', version: 1, configuredSecrets: { password: true }, ready: true,
  },
];
const kinds: ConnectionKind[] = [
  { kind: 'file', fields: [{ name: 'directory', label: 'Directory', required: true }] },
  { kind: 'postgres', fields: [
    { name: 'host', label: 'Host', required: true },
    { name: 'password', label: 'Password', secret: true, required: true },
  ] },
  { kind: 'mysql', fields: [
    { name: 'host', label: 'Host', required: true },
    { name: 'password', label: 'Password', secret: true, required: true },
  ] },
];
const fixedDriver: ConfigField = { name: 'driver', type: 'ENUM', label: 'Driver', enumValues: ['postgres'] };
const multipleDrivers: ConfigField = { ...fixedDriver, enumValues: ['postgres', 'mysql'] };

function openPanel({ driverField, config = {}, pluginId = 'postgres', kind = 'source' }: {
  driverField?: ConfigField;
  config?: Record<string, unknown>;
  pluginId?: string;
  kind?: 'source' | 'sink';
} = {}) {
  const response = (body: unknown) => new Response(JSON.stringify(body));
  const requests = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') throw new Error('Unexpected mutation in projection test');
    if (url.endsWith('/healthz')) {
      return response({ status: 'ok', pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v1' });
    }
    if (url.endsWith('/connection-kinds?tenantId=' + tenantId)) return response(kinds);
    if (url.endsWith('/connections?tenantId=' + tenantId)) return response({ connections: resources });
    throw new Error('Unexpected request: ' + url);
  });
  vi.stubGlobal('fetch', requests);
  const original = { connection_ref: '', ...config };
  const fields: ConfigField[] = [
    { name: 'connection_ref', type: 'STRING', label: 'Connection', required: true },
    ...(driverField ? [driverField] : []),
  ];
  usePipelineStore.getState().reset(tenantId);
  usePipelineStore.setState({ nodes: [{
    id: 'node', type: 'pipelineNode', position: { x: 0, y: 0 },
    data: {
      name: 'node', nodeType: kind, pluginId, componentId: kind,
      pluginLabel: pluginId, isValid: true, config: original,
    },
  }] });
  useUIStore.setState({ selectedNodeId: 'node' });
  usePaletteStore.setState({ plugins: [{
    id: pluginId, version: '1', displayName: pluginId, origin: 'builtin',
    components: [{ id: kind, kind, displayName: kind, configSchema: { fields } }],
  }] });
  render(<ConfigPanel showSourcePreview={false} />);
  return { original, requests };
}

function currentConfig() {
  return usePipelineStore.getState().nodes.find((node) => node.id === 'node')!.data.config;
}

function optionValues(select: HTMLElement) {
  return within(select).getAllByRole('option').map((option) => (option as HTMLOptionElement).value);
}

async function readyConnections() {
  const select = screen.getByRole('combobox', { name: /^Connection\s*\*?$/ });
  await waitFor(() => expect(select).toBeEnabled());
  return select;
}

it.each(['source', 'sink'] as const)('uses the Catalog singleton for %s without inserting a driver or replacing a mismatched reference', async (kind) => {
  const { original, requests } = openPanel({ kind, driverField: fixedDriver, config: { connection_ref: 'file-ref' } });
  const select = await readyConnections();
  expect(optionValues(select)).toEqual(['', 'file-ref', 'pg-ref']);
  expect(within(select).getByRole('option', { name: 'file-ref (not available)' })).toBeDisabled();
  expect(within(select).getByRole('option', { name: 'PG fixture (postgres)' })).toBeEnabled();
  expect(select).toHaveValue('file-ref');
  expect(currentConfig()).toEqual(original);
  expect(currentConfig()).not.toHaveProperty('driver');

  fireEvent.click(screen.getByRole('button', { name: 'New connection' }));
  const kindSelect = screen.getByRole('combobox', { name: 'Connection kind' });
  await within(kindSelect).findByRole('option', { name: 'postgres', exact: true });
  expect(kindSelect).toHaveValue('postgres');
  expect(kindSelect).toBeDisabled();
  expect(optionValues(kindSelect)).toEqual(['', 'postgres']);
  expect(currentConfig()).toEqual(original);
  expect(requests.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});

it.each(['postgres', 'file'])('uses a singleton on an arbitrary component instead of mutable config.driver=%s', async (driver) => {
  const { original } = openPanel({
    pluginId: 'catalog-defined-component', driverField: fixedDriver, config: { driver },
  });
  expect(optionValues(await readyConnections())).toEqual(['', 'pg-ref']);
  expect(currentConfig()).toEqual(original);
});

it('projects only a declared explicit multi-driver selection and reacts without replacing the existing connection', async () => {
  const { requests } = openPanel({
    pluginId: 'multi-driver-component', driverField: multipleDrivers,
    config: { driver: 'postgres', connection_ref: 'pg-ref' },
  });
  expect(optionValues(await readyConnections())).toEqual(['', 'pg-ref']);

  fireEvent.change(screen.getByRole('combobox', { name: 'Driver', exact: true }), { target: { value: 'mysql' } });
  const mysqlSelect = await readyConnections();
  expect(optionValues(mysqlSelect)).toEqual(['', 'pg-ref', 'mysql-ref']);
  expect(within(mysqlSelect).getByRole('option', { name: 'pg-ref (not available)' })).toBeDisabled();
  expect(within(mysqlSelect).getByRole('option', { name: 'MySQL fixture (mysql)' })).toBeEnabled();
  expect(currentConfig()).toEqual({ driver: 'mysql', connection_ref: 'pg-ref' });

  fireEvent.change(screen.getByRole('combobox', { name: 'Driver', exact: true }), { target: { value: '' } });
  expect(optionValues(await readyConnections())).toEqual(['', 'pg-ref', 'file-ref', 'mysql-ref']);
  expect(currentConfig()).toEqual({ connection_ref: 'pg-ref' });
  expect(requests.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});

const unrestrictedCases: Array<{ name: string; driverField?: ConfigField; config: Record<string, unknown> }> = [
  { name: 'absent driver metadata', config: { driver: 'postgres' } },
  { name: 'a non-enum driver field', driverField: { ...fixedDriver, type: 'STRING' }, config: { driver: 'postgres' } },
  { name: 'an empty declared enum', driverField: { ...fixedDriver, enumValues: [] }, config: { driver: 'postgres' } },
  { name: 'an unset multi-driver enum', driverField: multipleDrivers, config: {} },
  { name: 'an undeclared multi-driver value', driverField: multipleDrivers, config: { driver: 'file' } },
  { name: 'a non-string multi-driver value', driverField: multipleDrivers, config: { driver: 1 } },
  {
    name: 'a schema default without an explicit multi-driver selection',
    driverField: { ...multipleDrivers, defaultValue: { stringValue: 'postgres' } }, config: {},
  },
];

it.each(unrestrictedCases)('keeps the generic connection control unrestricted for $name', async ({ driverField, config }) => {
  const { original, requests } = openPanel({ driverField, config });
  expect(optionValues(await readyConnections())).toEqual(['', 'pg-ref', 'file-ref', 'mysql-ref']);
  expect(currentConfig()).toEqual(original);

  fireEvent.click(screen.getByRole('button', { name: 'New connection' }));
  const kindSelect = screen.getByRole('combobox', { name: 'Connection kind' });
  await waitFor(() => expect(kindSelect).toBeEnabled());
  expect(optionValues(kindSelect)).toEqual(['', 'file', 'postgres', 'mysql']);
  expect(kindSelect).toHaveValue('');
  expect(currentConfig()).toEqual(original);
  expect(requests.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});

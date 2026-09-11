import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfigPanel } from './ConfigPanel';
import { discoverSchema, validateConfig } from '@/api/controlPlane';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { useUIStore } from '@/stores/useUIStore';
import type { ConfigField, TableInfo } from '@/types/plugin';

vi.mock('@/api/controlPlane', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/controlPlane')>(),
  discoverSchema: vi.fn(),
  validateConfig: vi.fn(),
}));
vi.mock('./PluginOperationsPanel', () => ({ PluginOperationsPanel: () => null }));
vi.mock('./SourcePreviewPanel', () => ({ SourcePreviewPanel: () => null }));
vi.mock('./ConnectionField', () => ({
  ConnectionField: ({ id, value, onChange }: { id: string; value: string; onChange: (id: string) => void }) => (
    <div>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select a connection</option>
        <option value="conn-a">Connection A</option>
        <option value="conn-b">Connection B</option>
      </select>
      <button type="button" onClick={() => onChange(value)}>Save same connection</button>
    </div>
  ),
}));

// Keep the raw-editor boundary simple; ConfigPanel still commits through the real store.
vi.mock('./JsonEditorField', () => ({
  JsonEditorField: ({ value, onChange }: {
    value: Record<string, unknown>;
    onChange: (value: Record<string, unknown>) => void;
  }) => (
    <textarea aria-label="Raw JSON config" value={JSON.stringify(value)}
      onChange={(event) => onChange(JSON.parse(event.target.value))} />
  ),
}));

type Discovery = Awaited<ReturnType<typeof discoverSchema>>;
type Validation = Awaited<ReturnType<typeof validateConfig>>;
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

async function complete<T>(pending: Deferred<T>, result: T) {
  await act(async () => { pending.resolve(result); await pending.promise; });
}

async function fail<T>(pending: Deferred<T>) {
  await act(async () => {
    pending.reject(new Error('obsolete failure'));
    await pending.promise.catch(() => undefined);
  });
}

const discovery = vi.mocked(discoverSchema);
const validation = vi.mocked(validateConfig);
const tables: TableInfo[] = [
  { schema: 'public', name: 'first', kind: 'TABLE' },
  { schema: 'public', name: 'second', kind: 'VIEW' },
];
const obsoleteTables: Discovery = {
  tables: [{ schema: 'public', name: 'obsolete', kind: 'TABLE' }], columns: [],
};
const fields: ConfigField[] = [
  { name: 'connection_ref', type: 'STRING', label: 'Connection', required: true },
  { name: 'table', type: 'STRING', label: 'Table' },
  { name: 'columns', type: 'STRING', label: 'Columns' },
  { name: 'note', type: 'STRING', label: 'Note' },
];

beforeEach(() => {
  discovery.mockReset().mockResolvedValue({ tables: [], columns: [] });
  validation.mockReset().mockResolvedValue({ ok: true, message: 'Current validation' });
});
afterEach(cleanup);

function mountPanel(nodeId?: string) {
  usePipelineStore.getState().reset('async-context');
  usePipelineStore.setState({ nodes: ['first', 'second'].map((id) => ({
    id, type: 'pipelineNode', position: { x: 0, y: 0 },
    data: {
      name: id, nodeType: 'source' as const, pluginId: 'postgres', componentId: 'source',
      pluginLabel: 'PostgreSQL', isValid: true,
      config: { connection_ref: 'conn-a', table: '', columns: '', note: '' },
    },
  })) });
  useUIStore.setState({ selectedNodeId: 'first' });
  usePaletteStore.setState({ plugins: ['postgres', 'other'].map((id) => ({
    id, version: '1', displayName: id,
    components: ['source', 'alternate'].map((componentId) => ({
      id: componentId, kind: 'source' as const, displayName: componentId, configSchema: { fields },
    })),
  })) });
  return render(<ConfigPanel nodeId={nodeId} showSourcePreview={false} />);
}

function activeNode() {
  return usePipelineStore.getState().nodes.find((node) => node.id === useUIStore.getState().selectedNodeId)!;
}

function queueDiscovery() {
  const pending = deferred<Discovery>();
  discovery.mockReturnValueOnce(pending.promise);
  return pending;
}

function queueValidation() {
  const pending = deferred<Validation>();
  validation.mockReturnValueOnce(pending.promise);
  return pending;
}

function clickDiscover() {
  fireEvent.click(screen.getByRole('button', { name: 'Discover', exact: true }));
}

function clickValidate() {
  fireEvent.click(screen.getByRole('button', { name: 'Validate Config', exact: true }));
}

async function loadTables() {
  discovery.mockResolvedValueOnce({ tables, columns: [] });
  clickDiscover();
  await screen.findByRole('option', { name: 'public.first (Table)', exact: true });
}

const scopes = ['node', 'tenant', 'plugin', 'component', 'connection', 'config'] as const;
type Scope = typeof scopes[number];

function changeContext(scope: Scope) {
  switch (scope) {
    case 'node':
      act(() => useUIStore.setState({ selectedNodeId: 'second' }));
      break;
    case 'tenant':
      act(() => usePipelineStore.setState({ tenantId: 'another-tenant' }));
      break;
    case 'plugin':
      fireEvent.change(screen.getByRole('combobox', { name: 'Component', exact: true }), { target: { value: 'other/source' } });
      break;
    case 'component':
      fireEvent.change(screen.getByRole('combobox', { name: 'Component', exact: true }), { target: { value: 'postgres/alternate' } });
      break;
    case 'connection':
      fireEvent.change(screen.getByRole('combobox', { name: /^Connection\s*\*?$/ }), { target: { value: 'conn-b' } });
      break;
    case 'config':
      fireEvent.change(screen.getByRole('textbox', { name: 'Note', exact: true }), { target: { value: 'changed configuration' } });
      break;
  }
}

const staleCases = scopes.flatMap((scope) => (['success', 'failure'] as const).map((outcome) => ({ scope, outcome })));

it.each(staleCases)('ignores obsolete discovery $outcome after $scope changes without settling the new request', async ({ scope, outcome }) => {
  mountPanel();
  const old = queueDiscovery();
  clickDiscover();
  changeContext(scope);
  expect(screen.getByRole('button', { name: 'Discover', exact: true })).toBeEnabled();

  const current = queueDiscovery();
  const preserved = { ...activeNode().data.config };
  clickDiscover();
  const expected = { ...preserved };
  delete expected.table;
  delete expected.columns;
  expect(discovery).toHaveBeenLastCalledWith(
    activeNode().data.pluginId, activeNode().data.componentId, expected, usePipelineStore.getState().tenantId,
  );

  if (outcome === 'success') await complete(old, obsoleteTables);
  else await fail(old);
  expect(screen.getByRole('button', { name: '...', exact: true })).toBeDisabled();
  expect(screen.queryByRole('option', { name: 'public.obsolete (Table)', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText(/Schema discovery failed:/)).not.toBeInTheDocument();

  await complete(current, { tables, columns: [] });
  expect(screen.getByRole('option', { name: 'public.first (Table)', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discover', exact: true })).toBeEnabled();
  expect(activeNode().data.config).toEqual(preserved);
  expect(discovery).toHaveBeenCalledTimes(2);
  expect(validation).not.toHaveBeenCalled();
});

it.each(staleCases)('ignores obsolete validation $outcome after $scope changes without settling the new request', async ({ scope, outcome }) => {
  mountPanel();
  const old = queueValidation();
  clickValidate();
  changeContext(scope);
  expect(screen.getByRole('button', { name: 'Validate Config', exact: true })).toBeEnabled();

  const current = queueValidation();
  const preserved = { ...activeNode().data.config };
  clickValidate();
  expect(validation).toHaveBeenLastCalledWith(
    activeNode().data.pluginId, activeNode().data.componentId, preserved, usePipelineStore.getState().tenantId,
  );
  if (outcome === 'success') await complete(old, { ok: false, message: 'Obsolete validation' });
  else await fail(old);
  expect(screen.getByRole('button', { name: 'Validating...', exact: true })).toBeDisabled();
  expect(screen.queryByText('Obsolete validation')).not.toBeInTheDocument();
  expect(screen.queryByText('Validation request failed')).not.toBeInTheDocument();

  await complete(current, { ok: true, message: 'Current validation' });
  expect(screen.getByText('Current validation')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Validate Config', exact: true })).toBeEnabled();
  expect(activeNode().data.config).toEqual(preserved);
  expect(validation).toHaveBeenCalledTimes(2);
  expect(discovery).not.toHaveBeenCalled();
});

it('clears loaded tables and columns on a same-ID connection save and ignores its pending old discovery', async () => {
  mountPanel();
  await loadTables();
  discovery.mockResolvedValueOnce({ tables: [], columns: [{ name: 'first_id', type: 'int64', nullable: false }] });
  fireEvent.change(screen.getByRole('combobox', { name: 'Table', exact: true }), { target: { value: 'public.first' } });
  await screen.findByRole('checkbox', { name: /first_id/ });
  clickValidate();
  await screen.findByText('Current validation');

  const old = queueDiscovery();
  clickDiscover();
  const preserved = { ...activeNode().data.config };
  fireEvent.click(screen.getByRole('button', { name: 'Save same connection' }));
  expect(activeNode().data.config).toEqual(preserved);
  expect(activeNode().data.config.connection_ref).toBe('conn-a');
  expect(screen.getByRole('textbox', { name: 'Table', exact: true })).toHaveValue('public.first');
  expect(screen.queryByRole('option', { name: 'public.first (Table)', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: /first_id/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Current validation')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discover', exact: true })).toBeEnabled();

  await complete(old, obsoleteTables);
  expect(screen.queryByRole('option', { name: 'public.obsolete (Table)', exact: true })).not.toBeInTheDocument();
  expect(discovery).toHaveBeenCalledTimes(3);
  expect(validation).toHaveBeenCalledTimes(1);
});

it('clears loaded schema immediately when a different connection is selected', async () => {
  mountPanel();
  await loadTables();
  changeContext('connection');
  expect(screen.getByRole('textbox', { name: 'Table', exact: true })).toHaveValue('');
  expect(screen.queryByRole('option', { name: 'public.first (Table)', exact: true })).not.toBeInTheDocument();
  expect(activeNode().data.config.connection_ref).toBe('conn-b');
  expect(discovery).toHaveBeenCalledTimes(1);
});

it('clears an obsolete discovery error on an ordinary config edit without automatically discovering', async () => {
  mountPanel();
  const pending = queueDiscovery();
  clickDiscover();
  await fail(pending);
  expect(screen.getByText(/Schema discovery failed: obsolete failure/)).toBeInTheDocument();
  changeContext('config');
  expect(screen.queryByText(/Schema discovery failed:/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discover', exact: true })).toBeEnabled();
  expect(screen.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue('changed configuration');
  expect(discovery).toHaveBeenCalledTimes(1);
});

it.each(['older first', 'newer first'])('keeps the table list and post-commit column context when requests finish %s', async (order) => {
  mountPanel();
  await loadTables();
  const old = queueDiscovery();
  fireEvent.change(screen.getByRole('combobox', { name: 'Table', exact: true }), { target: { value: 'public.first' } });
  const current = queueDiscovery();
  fireEvent.change(screen.getByRole('combobox', { name: 'Table', exact: true }), { target: { value: 'public.second' } });
  const tableSelect = screen.getByRole('combobox', { name: 'Table', exact: true });
  expect(within(tableSelect).getByRole('option', { name: 'public.first (Table)' })).toBeInTheDocument();
  expect(within(tableSelect).getByRole('option', { name: 'public.second (View)' })).toBeInTheDocument();
  expect(discovery).toHaveBeenLastCalledWith(
    'postgres', 'source', { connection_ref: 'conn-a', table: 'public.second', note: '' }, 'async-context',
  );
  const oldResult: Discovery = { tables: [], columns: [{ name: 'old_id', type: 'int64', nullable: false }] };
  const currentResult: Discovery = { tables: [], columns: [{ name: 'current_id', type: 'int64', nullable: false }] };

  if (order === 'newer first') {
    await complete(current, currentResult);
    await complete(old, oldResult);
  } else {
    await complete(old, oldResult);
    expect(screen.getByRole('button', { name: '...', exact: true })).toBeDisabled();
    await complete(current, currentResult);
  }
  expect(screen.getByRole('checkbox', { name: /current_id/ })).toBeChecked();
  expect(screen.queryByRole('checkbox', { name: /old_id/ })).not.toBeInTheDocument();
  expect(tableSelect).toHaveValue('public.second');
  expect(within(tableSelect).getByRole('option', { name: 'public.first (Table)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discover', exact: true })).toBeEnabled();
  expect(activeNode().data.config).toEqual({ connection_ref: 'conn-a', table: 'public.second', note: '' });
});

it('prevents an earlier table-list request from replacing the list or clearing a newer column request', async () => {
  mountPanel();
  await loadTables();
  const oldTables = queueDiscovery();
  clickDiscover();
  const currentColumns = queueDiscovery();
  fireEvent.change(screen.getByRole('combobox', { name: 'Table', exact: true }), { target: { value: 'public.first' } });
  await complete(oldTables, obsoleteTables);
  expect(screen.getByRole('button', { name: '...', exact: true })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'public.second (View)', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'public.obsolete (Table)', exact: true })).not.toBeInTheDocument();

  await complete(currentColumns, { tables: [], columns: [{ name: 'current_id', type: 'int64', nullable: false }] });
  expect(screen.getByRole('checkbox', { name: /current_id/ })).toBeChecked();
  expect(screen.getByRole('combobox', { name: 'Table', exact: true })).toHaveValue('public.first');
  expect(screen.getByRole('option', { name: 'public.second (View)', exact: true })).toBeInTheDocument();
});

it('keeps discovery and validation request lifetimes independent in the same context', async () => {
  mountPanel();
  const pendingDiscovery = queueDiscovery();
  const pendingValidation = queueValidation();
  clickDiscover();
  clickValidate();
  await complete(pendingValidation, { ok: true, message: 'Current validation' });
  expect(screen.getByRole('button', { name: '...', exact: true })).toBeDisabled();
  await complete(pendingDiscovery, { tables, columns: [] });
  expect(screen.getByText('Current validation')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'public.first (Table)', exact: true })).toBeInTheDocument();
});

it('uses the explicit node prop rather than the ambient selection when rejecting an old response', async () => {
  const view = mountPanel('first');
  const old = queueDiscovery();
  clickDiscover();
  view.rerender(<ConfigPanel nodeId="second" showSourcePreview={false} />);
  expect(useUIStore.getState().selectedNodeId).toBe('first');
  expect(screen.getByRole('button', { name: 'Discover', exact: true })).toBeEnabled();
  await complete(old, obsoleteTables);
  expect(screen.queryByRole('option', { name: 'public.obsolete (Table)', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Node Name', exact: true })).toHaveValue('second');
});

it.each(['success', 'failure'])('ignores both operation completions after unmount (%s)', async (outcome) => {
  const view = mountPanel();
  const pendingDiscovery = queueDiscovery();
  const pendingValidation = queueValidation();
  clickDiscover();
  clickValidate();
  view.unmount();
  if (outcome === 'success') {
    await complete(pendingDiscovery, obsoleteTables);
    await complete(pendingValidation, { ok: false, message: 'Obsolete validation' });
  } else {
    await fail(pendingDiscovery);
    await fail(pendingValidation);
  }
  mountPanel();
  expect(screen.queryByRole('option', { name: 'public.obsolete (Table)', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText('Obsolete validation')).not.toBeInTheDocument();
  expect(screen.queryByText(/Schema discovery failed:/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discover', exact: true })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Validate Config', exact: true })).toBeEnabled();
  expect(discovery).toHaveBeenCalledTimes(1);
  expect(validation).toHaveBeenCalledTimes(1);
});

async function openRawConfig() {
  fireEvent.click(screen.getByRole('button', { name: 'Raw JSON', exact: true }));
  return screen.findByRole('textbox', { name: 'Raw JSON config', exact: true });
}

function changeRawConfig(editor: HTMLElement, changes: Record<string, unknown>) {
  fireEvent.change(editor, {
    target: { value: JSON.stringify({ ...activeNode().data.config, ...changes }) },
  });
}

function showGuidedConfig() {
  fireEvent.click(screen.getByRole('button', { name: 'Schema Form', exact: true }));
}

async function loadFirstTableColumns() {
  await loadTables();
  discovery.mockResolvedValueOnce({
    tables: [], columns: [{ name: 'first_id', type: 'int64', nullable: false }],
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Table', exact: true }), {
    target: { value: 'public.first' },
  });
  await screen.findByRole('checkbox', { name: /first_id/ });
}

it('Raw JSON connection changes discard prior table and column candidates without automatic discovery', async () => {
  mountPanel();
  await loadFirstTableColumns();
  const editor = await openRawConfig();
  changeRawConfig(editor, { connection_ref: 'conn-b' });
  showGuidedConfig();

  expect(screen.getByRole('textbox', { name: 'Table', exact: true })).toHaveValue('public.first');
  expect(screen.queryByRole('option', { name: 'public.first (Table)', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'public.second (View)', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: /first_id/ })).not.toBeInTheDocument();
  expect(activeNode().data.config).toEqual({ connection_ref: 'conn-b', table: 'public.first', note: '' });
  expect(screen.getByRole('button', { name: 'Discover', exact: true })).toBeEnabled();
  expect(discovery).toHaveBeenCalledTimes(2);
  expect(validation).not.toHaveBeenCalled();
});

it('Raw JSON ordinary config edits preserve the current connection table and column candidates', async () => {
  mountPanel();
  await loadFirstTableColumns();
  const editor = await openRawConfig();
  changeRawConfig(editor, { note: 'unrelated raw edit' });
  showGuidedConfig();

  const select = screen.getByRole('combobox', { name: 'Table', exact: true });
  expect(select).toHaveValue('public.first');
  expect(within(select).getByRole('option', { name: 'public.second (View)', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /first_id/ })).toBeChecked();
  expect(activeNode().data.config).toEqual({
    connection_ref: 'conn-a', table: 'public.first', note: 'unrelated raw edit',
  });
  expect(discovery).toHaveBeenCalledTimes(2);
});

it.each(['success', 'failure'])('Raw JSON A->B->A ignores obsolete %s without restoring old arrays or settling current discovery', async (outcome) => {
  mountPanel();
  await loadTables();
  const oldA = queueDiscovery();
  clickDiscover();

  let editor = await openRawConfig();
  changeRawConfig(editor, { connection_ref: 'conn-b' });
  showGuidedConfig();
  expect(screen.getByRole('textbox', { name: 'Table', exact: true })).toHaveValue('');
  expect(screen.queryByRole('option', { name: 'public.first (Table)', exact: true })).not.toBeInTheDocument();

  const oldB = queueDiscovery();
  clickDiscover();
  editor = await openRawConfig();
  changeRawConfig(editor, { connection_ref: 'conn-a' });
  showGuidedConfig();
  expect(screen.getByRole('textbox', { name: 'Table', exact: true })).toHaveValue('');

  const currentA = queueDiscovery();
  clickDiscover();
  if (outcome === 'success') {
    await complete(oldA, obsoleteTables);
    await complete(oldB, { tables, columns: [] });
  } else {
    await fail(oldA);
    await fail(oldB);
  }
  expect(screen.getByRole('button', { name: '...', exact: true })).toBeDisabled();
  expect(screen.queryByRole('option', { name: 'public.obsolete (Table)', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'public.first (Table)', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText(/Schema discovery failed:/)).not.toBeInTheDocument();

  await complete(currentA, {
    tables: [{ schema: 'public', name: 'current_a', kind: 'TABLE' }], columns: [],
  });
  expect(screen.getByRole('option', { name: 'public.current_a (Table)', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'public.first (Table)', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discover', exact: true })).toBeEnabled();
  expect(activeNode().data.config.connection_ref).toBe('conn-a');
  expect(discovery).toHaveBeenCalledTimes(4);
  expect(validation).not.toHaveBeenCalled();
});

it('Raw JSON A->B->A without new discovery does not recover cached schema or accept the old A response', async () => {
  mountPanel();
  await loadFirstTableColumns();
  const oldA = queueDiscovery();
  clickDiscover();
  const editor = await openRawConfig();
  changeRawConfig(editor, { connection_ref: 'conn-b' });
  changeRawConfig(editor, { connection_ref: 'conn-a' });
  showGuidedConfig();

  expect(screen.getByRole('textbox', { name: 'Table', exact: true })).toHaveValue('public.first');
  expect(screen.queryByRole('checkbox', { name: /first_id/ })).not.toBeInTheDocument();
  await complete(oldA, obsoleteTables);
  expect(screen.queryByRole('option', { name: 'public.obsolete (Table)', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'public.first (Table)', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discover', exact: true })).toBeEnabled();
  expect(activeNode().data.config).toEqual({ connection_ref: 'conn-a', table: 'public.first', note: '' });
  expect(discovery).toHaveBeenCalledTimes(3);
});

it('Raw JSON does not infer a connection scope from an undeclared connection_ref key', async () => {
  mountPanel();
  act(() => usePaletteStore.setState({ plugins: [{
    id: 'postgres', version: '1', displayName: 'postgres',
    components: [{
      id: 'source', kind: 'source', displayName: 'source',
      configSchema: { fields: fields.filter((field) => field.name !== 'connection_ref') },
    }],
  }] }));
  await loadTables();
  const editor = await openRawConfig();
  changeRawConfig(editor, { connection_ref: 'opaque-component-value' });
  showGuidedConfig();

  expect(screen.getByRole('option', { name: 'public.first (Table)', exact: true })).toBeInTheDocument();
  expect(activeNode().data.config.connection_ref).toBe('opaque-component-value');
  expect(discovery).toHaveBeenCalledTimes(1);
});

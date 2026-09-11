import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ConfigPanel } from './ConfigPanel';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { useUIStore } from '@/stores/useUIStore';
import { parseJson, stringifyJson } from '@/lib/json';
import type { ConfigSchema, PluginInfo } from '@/types/plugin';

vi.mock('./JsonEditorField', () => ({ JsonEditorField: ({ value }: { value: Record<string, unknown> }) => <textarea aria-label="Existing raw config" value={stringifyJson(value)} readOnly /> }));

const descriptor = (configSchema?: ConfigSchema): PluginInfo => ({ id: 'records', displayName: 'Records', version: '1', origin: 'builtin', components: [{
  id: 'mapping', displayName: 'Mapping', kind: 'processor', origin: 'builtin', configSchema,
}] });

beforeEach(() => {
  usePipelineStore.getState().reset('workbench-final-Q76jPR');
  usePipelineStore.setState({ name: 'preserved', pipelineId: 'preserved-id', nodes: [{ id: 'mapping-node', type: 'pipelineNode', position: { x: 10, y: 20 }, data: {
    nodeType: 'processor', name: 'mapping-node', pluginId: 'records', componentId: 'mapping', pluginLabel: 'Mapping', isValid: true,
    config: parseJson('{"mappings":[{"target":"amount","expression":"-record.amount"}],"exact":9007199254740993,"decimal":123456789.012345678900}') as Record<string, unknown>,
  } }] });
  useUIStore.setState({ selectedNodeId: 'mapping-node' });
  usePaletteStore.setState({ plugins: [], loading: false, error: 'Catalog unavailable' });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(['loading', 'failure', 'missing-component'])('does not claim runs-as-is when descriptor metadata is unavailable: %s', (state) => {
  if (state === 'loading') usePaletteStore.setState({ loading: true, error: null });
  if (state === 'missing-component') usePaletteStore.setState({ plugins: [{ ...descriptor(), components: [] }], error: null });
  const original = usePipelineStore.getState(); render(<ConfigPanel />);
  expect(screen.getByText('Configuration schema unavailable')).toBeInTheDocument();
  expect(screen.getByText(/Component Catalog.*Retry/)).toBeInTheDocument();
  expect(screen.queryByText('No configuration needed')).not.toBeInTheDocument();
  expect(screen.queryByText(/This component runs as-is/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Component')).toHaveValue('records/mapping');
  expect(screen.getByRole('option', { name: /Mapping.*metadata unavailable/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Raw JSON' })).toBeEnabled();
  expect(usePipelineStore.getState()).toBe(original); expect(fetch).not.toHaveBeenCalled();
});

it('treats an omitted config schema as unknown even when the descriptor is present', () => {
  usePaletteStore.setState({ plugins: [descriptor()], error: null }); render(<ConfigPanel />);
  expect(screen.getByText('Configuration schema unavailable')).toBeInTheDocument();
  expect(screen.queryByText('No configuration needed')).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it('retains the no-configuration state for a known explicitly empty schema', () => {
  usePaletteStore.setState({ plugins: [descriptor({ fields: [] })], error: null }); render(<ConfigPanel />);
  expect(screen.getByText('No configuration needed')).toBeInTheDocument();
  expect(screen.getByText(/This component runs as-is/)).toBeInTheDocument();
  expect(screen.queryByText('Configuration schema unavailable')).not.toBeInTheDocument();
});

it('keeps Raw JSON and exact node configuration accessible while metadata is unavailable', async () => {
  const original = usePipelineStore.getState(); render(<ConfigPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Raw JSON' }));
  const input = await screen.findByLabelText('Existing raw config');
  expect(input).toHaveValue(stringifyJson(original.nodes[0].data.config));
  expect((input as HTMLTextAreaElement).value).toContain('9007199254740993');
  expect(usePipelineStore.getState()).toBe(original); expect(fetch).not.toHaveBeenCalled();
});

it('restores the structured mapping form on catalog recovery without replacing node values or identity', async () => {
  const original = usePipelineStore.getState(); render(<ConfigPanel />);
  expect(screen.getByText('Configuration schema unavailable')).toBeInTheDocument();
  act(() => usePaletteStore.setState({ loading: false, error: null, plugins: [descriptor({ fields: [{
    name: 'mappings', type: 'ARRAY', label: 'Mapping fields', properties: [
      { name: 'target', type: 'STRING', label: 'Target field', required: true },
      { name: 'expression', type: 'STRING', label: 'Expression', required: true },
    ],
  }] })] }));
  expect(await screen.findByLabelText('Expression')).toHaveValue('-record.amount');
  expect(screen.getByLabelText('Target field')).toHaveValue('amount');
  expect(screen.queryByText('Configuration schema unavailable')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Component')).toHaveValue('records/mapping');
  expect(usePipelineStore.getState()).toBe(original); expect(fetch).not.toHaveBeenCalled();
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// The Validate Config button is the ConfigPanel behavior under test. SchemaForm
// is mocked to keep the test focused on ConfigPanel's own behavior (header,
// validate button) rather than SchemaForm internals. The raw-JSON editor
// (JsonEditorField, now in its own module) is never rendered in these tests —
// the mocked node has a configSchema, so the schema-form branch is taken.

// IMPORTANT: the store mock must return STABLE references. ConfigPanel has
// effects keyed on node?.data?.config and pluginId/componentId; if the selector
// returns a fresh object/array each call, those effects fire every render →
// setState every render → infinite re-render loop → OOM. The earlier failure
// (file under .skip) was attributed to "CodeMirror hangs in jsdom"; the actual
// cause was this reference-instability loop. Hoisting the data to module scope
// keeps node.data.config referentially identical across renders.

const NODE = {
  id: 'node-1',
  data: {
    nodeType: 'source',
    name: 'test-source',
    pluginId: 'plugin-1',
    componentId: 'comp-1',
    pluginLabel: 'Test Plugin',
    config: { host: 'localhost' },
    isValid: true,
  },
};

const PLUGINS = [
  {
    id: 'plugin-1',
    version: '1.0.0',
    displayName: 'Test Plugin',
    components: [
      {
        id: 'comp-1',
        kind: 'source',
        displayName: 'Test Source',
        configSchema: {
          fields: [{ name: 'host', type: 'STRING', label: 'Host', required: true }],
        },
      },
    ],
  },
];

const ITEMS_BY_KIND = {
  source: [
    {
      pluginId: 'plugin-1',
      pluginDisplayName: 'Test Plugin',
      componentId: 'comp-1',
      componentDisplayName: 'Test Source',
      kind: 'source' as const,
    },
  ],
  processor: [],
  sink: [],
};

const { mockValidateConfig, mockSetNodeName, mockSetComponent, mockSetConfig } =
  vi.hoisted(() => ({
    mockValidateConfig: vi.fn(),
    mockSetNodeName: vi.fn(),
    mockSetComponent: vi.fn(),
    mockSetConfig: vi.fn(),
  }));

vi.mock('./SchemaForm', () => ({
  SchemaForm: () => null,
}));

vi.mock('@/api/controlPlane', () => ({
  validateConfig: (...args: unknown[]) => mockValidateConfig(...args),
  discoverSchema: vi.fn(),
}));

vi.mock('@/stores/usePipelineStore', () => {
  const getState = () => ({
    nodes: [NODE],
    tenantId: 'tenant-a',
    edges: [],
    setNodeName: mockSetNodeName,
    setComponent: mockSetComponent,
    setConfig: mockSetConfig,
  });
  return {
    usePipelineStore: Object.assign(
      (selector: (s: Record<string, unknown>) => unknown) => selector(getState()),
      { getState },
    ),
  };
});

vi.mock('@/stores/useUIStore', () => {
  const getState = () => ({ selectedNodeId: 'node-1' });
  return {
    useUIStore: Object.assign(
      (selector: (s: Record<string, unknown>) => unknown) => selector(getState()),
      { getState },
    ),
  };
});

vi.mock('@/stores/usePaletteStore', () => ({
  usePaletteStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      plugins: PLUGINS,
      getItemsByKind: () => ITEMS_BY_KIND,
    }),
}));

// Import AFTER vi.mock so the module-level mocks apply.
import { ConfigPanel } from './ConfigPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ConfigPanel — header shows display name (UUID-leak fix)', () => {
  it('renders the plugin display name as the header, not the plugin id', () => {
    render(<ConfigPanel />);
    // The mocked node carries pluginLabel 'Test Plugin' — it must appear as the
    // human-readable header. The raw pluginId ('plugin-1') should NOT be the
    // primary title.
    expect(screen.getByText('Test Plugin')).toBeInTheDocument();
  });

  it('shows the user-given node name as a subtitle', () => {
    render(<ConfigPanel />);
    expect(screen.getByText('test-source')).toBeInTheDocument();
  });
});

describe('ConfigPanel — ValidateConfig button', () => {
  it('renders a Validate Config button', () => {
    render(<ConfigPanel />);
    expect(screen.getByText('Validate Config')).toBeInTheDocument();
  });

  it('calls validateConfig on click', async () => {
    mockValidateConfig.mockResolvedValue({ ok: true, message: 'Config is valid' });
    render(<ConfigPanel />);

    fireEvent.click(screen.getByText('Validate Config'));

    await waitFor(() => {
      expect(mockValidateConfig).toHaveBeenCalledWith(
        'plugin-1',
        'comp-1',
        { host: 'localhost' },
        'tenant-a',
      );
    });
  });

  it('shows success message after valid config', async () => {
    mockValidateConfig.mockResolvedValue({ ok: true, message: 'Config is valid' });
    render(<ConfigPanel />);

    fireEvent.click(screen.getByText('Validate Config'));

    const successMsg = await screen.findByText('Config is valid');
    expect(successMsg).toBeInTheDocument();
  });

  it('shows error message after invalid config', async () => {
    mockValidateConfig.mockResolvedValue({
      ok: false,
      message: 'Missing required field: host',
    });
    render(<ConfigPanel />);

    fireEvent.click(screen.getByText('Validate Config'));

    const errorMsg = await screen.findByText('Missing required field: host');
    expect(errorMsg).toBeInTheDocument();
  });

  it('shows Validating... text while loading', async () => {
    // Never resolve the promise so we stay in loading state
    mockValidateConfig.mockReturnValue(new Promise(() => {}));
    render(<ConfigPanel />);

    fireEvent.click(screen.getByText('Validate Config'));

    expect(screen.getByText('Validating...')).toBeInTheDocument();
  });
});

it.each([
  { ok: true, role: 'status', text: 'Configuration is valid. This does not test the connection.' },
  { ok: false, role: 'alert', text: 'Configuration is invalid.' },
])('shows meaningful feedback when validation returns only ok=$ok', async ({ ok, role, text }) => {
  mockValidateConfig.mockResolvedValue({ ok });
  render(<ConfigPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Validate Config' }));
  expect(await screen.findByRole(role)).toHaveTextContent(text);
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfigPanel } from './ConfigPanel';
import '@testing-library/jest-dom/vitest';

// ── Hoisted mocks (available at vi.mock factory evaluation time) ──

const { mockValidateConfig, mockGetItemsByKind, mockSetNodeName, mockSetComponent, mockSetConfig } =
  vi.hoisted(() => ({
    mockValidateConfig: vi.fn(),
    mockGetItemsByKind: vi.fn().mockReturnValue({
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
    }),
    mockSetNodeName: vi.fn(),
    mockSetComponent: vi.fn(),
    mockSetConfig: vi.fn(),
  }));

vi.mock('@/api/controlPlane', () => ({
  validateConfig: (...args: unknown[]) => mockValidateConfig(...args),
}));

vi.mock('@/stores/usePipelineStore', () => ({
  usePipelineStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      nodes: [
        {
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
        },
      ],
      edges: [],
      setNodeName: mockSetNodeName,
      setComponent: mockSetComponent,
      setConfig: mockSetConfig,
    }),
}));

vi.mock('@/stores/useUIStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedNodeId: 'node-1',
    }),
}));

vi.mock('@/stores/usePaletteStore', () => ({
  usePaletteStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      plugins: [
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
                fields: [
                  {
                    name: 'host',
                    type: 'STRING',
                    label: 'Host',
                    required: true,
                  },
                ],
              },
            },
          ],
        },
      ],
      getItemsByKind: mockGetItemsByKind,
    }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

    expect(mockValidateConfig).toHaveBeenCalledWith(
      'plugin-1',
      'comp-1',
      { host: 'localhost' },
    );
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

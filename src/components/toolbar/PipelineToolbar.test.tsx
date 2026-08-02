import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

// The submit success path must transition the editor from "draft" to "saved":
// once a pipeline is persisted the server-assigned pipelineId is the identity,
// and the localStorage draft (which only existed to buffer unsaved work) is
// obsolete and must be cleared — otherwise a later page refresh restores the
// stale draft over the just-saved pipeline (user-scenario-analysis.md R1).
const submitPipelineMock = vi.fn();
const getExecutionMock = vi.fn();
vi.mock('@/api/controlPlane', () => ({
  submitPipeline: (...args: unknown[]) => submitPipelineMock(...args),
  getExecution: (...args: unknown[]) => getExecutionMock(...args),
}));

import { PipelineToolbar } from './PipelineToolbar';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { saveDraft, clearDraft, loadDraft } from '@/lib/draft';

function renderToolbar() {
  return render(
    <MemoryRouter>
      <PipelineToolbar />
    </MemoryRouter>,
  );
}

function seedSubmitablePipeline() {
  // Validate requires >= 2 nodes (source + sink) and a connected graph.
  usePipelineStore.getState().reset('test-tenant');
  usePipelineStore.setState({
    name: 'customer-sync',
    tenantId: 'test-tenant',
    nodes: [
      {
        id: 'src-1', type: 'pipelineNode', position: { x: 0, y: 0 },
        data: { nodeType: 'source', name: 'src-1', pluginId: 'p', componentId: 'source', pluginLabel: 'P', config: {}, isValid: true },
      },
      {
        id: 'snk-1', type: 'pipelineNode', position: { x: 0, y: 0 },
        data: { nodeType: 'sink', name: 'snk-1', pluginId: 'p', componentId: 'sink', pluginLabel: 'P', config: {}, isValid: true },
      },
    ],
    edges: [{ id: 'e1', source: 'src-1', target: 'snk-1' }],
  });
}

describe('PipelineToolbar — submit success transitions to saved', () => {
  beforeEach(() => {
    cleanup();
    useUIStore.getState().setSubmitStatus('idle');
    submitPipelineMock.mockReset();
    getExecutionMock.mockReset();
    localStorage.clear();
  });
  afterEach(cleanup);

  it('records the server pipelineId in the store after a successful submit', async () => {
    seedSubmitablePipeline();
    submitPipelineMock.mockResolvedValue({
      executionId: 'exec-1',
      pipelineId: 'server-assigned-id',
      status: 'succeeded',
    });

    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(usePipelineStore.getState().pipelineId).toBe('server-assigned-id');
    });
  });

  it('shows a UUID-free confirmation after submit (user sees a status, not an id)', async () => {
    seedSubmitablePipeline();
    submitPipelineMock.mockResolvedValue({
      executionId: 'exec-1',
      pipelineId: '5f7639fb-10be-4376-ab54-9d2ac0c117f9',
      status: 'succeeded',
    });

    renderToolbar();
    const submitBtn = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitBtn);

    const btn = await screen.findByRole('button', { name: /submitted/i });
    // The visible label must be a human status. A hex blob like "5f7639fb"
    // leaking into the button is exactly what the user complained about.
    expect(btn.textContent).toMatch(/submitted/i);
    expect(btn.textContent).not.toMatch(/[0-9a-f]{8}-/i);
    expect(btn.textContent).not.toMatch(/5f7639fb/i);
  });

  it('clears the localStorage draft after a successful submit (draft is obsolete once saved)', async () => {
    seedSubmitablePipeline();
    // Simulate a draft having been buffered during editing.
    saveDraft({ name: 'customer-sync', tenantId: 'test-tenant', nodes: usePipelineStore.getState().nodes, edges: [] });
    expect(loadDraft()).not.toBeNull();

    submitPipelineMock.mockResolvedValue({
      executionId: 'exec-1',
      pipelineId: 'server-assigned-id',
      status: 'succeeded',
    });

    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(loadDraft()).toBeNull();
    });
    // clearDraft is the export we want exercised; reference it so the import
    // isn't tree-shaken and the intent stays explicit.
    expect(clearDraft).toBeDefined();
  });
});

describe('PipelineToolbar — validation error readability', () => {
  beforeEach(() => {
    cleanup();
    useUIStore.getState().setValidationErrors([]);
    useUIStore.getState().setSubmitStatus('idle');
    submitPipelineMock.mockReset();
    getExecutionMock.mockReset();
  });
  afterEach(cleanup);

  it('renders the full error text without truncation and in a scrollable region', () => {
    seedSubmitablePipeline();
    // A realistic long engine error — the kind the user couldn't read because
    // it was ellipsized to one line.
    const longError =
      'resolution failed: spec validation failed: edge e-src-snk references node snk-1 which was removed; ' +
      'graph contains a cycle through proc-2 -> proc-3 -> proc-2; source node src-1 is missing required config field "connectionString"';
    useUIStore.getState().setValidationErrors([longError]);

    renderToolbar();

    // The whole message must be present in the DOM (not sliced).
    expect(screen.getByText(longError)).toBeInTheDocument();

    // The error region must scroll instead of forcing everything onto one
    // truncated line. We assert the structural contract: a bounded height +
    // vertical scroll. (whitespace-nowrap / no max-height is the bug.)
    const region = screen.getByText('1 issue').parentElement!;
    expect(region.className).toContain('overflow-y-auto');
    expect(region.className).toMatch(/max-h-/);
    expect(region.className).not.toContain('whitespace-nowrap');
  });
});

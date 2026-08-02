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

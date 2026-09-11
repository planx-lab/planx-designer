import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

// The save-only path must transition the editor from "draft" to "saved":
// once a pipeline is persisted the server-assigned pipelineId is the identity,
// and the localStorage draft (which only existed to buffer unsaved work) is
// obsolete and must be cleared — otherwise a later page refresh restores the
// stale draft over the just-saved pipeline (user-scenario-analysis.md R1).
const submitPipelineMock = vi.fn();
const runPipelineMock = vi.fn();
const getExecutionMock = vi.fn();
const updatePipelineMock = vi.fn();
const getExecutionByRequestMock = vi.fn();
const getConnectionsMock = vi.fn();
vi.mock('@/api/connections', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/connections')>(),
  getConnections: (...args: unknown[]) => getConnectionsMock(...args),
}));
vi.mock('@/api/controlPlane', () => ({
  submitPipeline: (...args: unknown[]) => submitPipelineMock(...args),
  runPipeline: (...args: unknown[]) => runPipelineMock(...args),
  getExecution: (...args: unknown[]) => getExecutionMock(...args),
  updatePipeline: (...args: unknown[]) => updatePipelineMock(...args),
  getExecutionByRequest: (...args: unknown[]) => getExecutionByRequestMock(...args),
}));

import { PipelineToolbar } from './PipelineToolbar';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { stringifyJson } from '@/lib/json';
import { saveDraft, clearDraft, loadDraft } from '@/lib/draft';
import type { ConnectionResource } from '@/types/connection';

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

function markSaved(id = 'p1') {
  const state = usePipelineStore.getState();
  state.acceptSaved(state.editorId, state.tenantId, id, 'saved-revision', stringifyJson(state.buildSpec()));
}
function seedSavedPipeline(id = 'p1') { seedSubmitablePipeline(); markSaved(id); }

beforeEach(() => {
  sessionStorage.clear();
  useUIStore.setState({ submitStatus: 'idle', submitResult: null, saveStatus: 'idle', saveError: null });
  updatePipelineMock.mockReset();
  getExecutionByRequestMock.mockReset();
  getConnectionsMock.mockReset().mockResolvedValue([]);
});

describe('PipelineToolbar — save success transitions to saved', () => {
  beforeEach(() => {
    cleanup();
    useUIStore.getState().setSubmitStatus('idle');
    submitPipelineMock.mockReset();
    runPipelineMock.mockReset();
    getExecutionMock.mockReset();
    localStorage.clear();
  });
  afterEach(cleanup);

  it('records the server pipelineId and revision after a non-executing save', async () => {
    seedSubmitablePipeline();
    submitPipelineMock.mockResolvedValue({
      pipelineId: 'server-assigned-id',
      revision: 'saved-revision',
    });

    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() => expect(usePipelineStore.getState().pipelineId).toBe('server-assigned-id'));
    expect(usePipelineStore.getState().pipelineRevision).toBe('saved-revision');
    expect(runPipelineMock).not.toHaveBeenCalled();
  });

  it('shows a UUID-free confirmation after submit (user sees a status, not an id)', async () => {
    seedSavedPipeline('5f7639fb-10be-4376-ab54-9d2ac0c117f9');
    runPipelineMock.mockResolvedValue({
      executionId: 'exec-1',
      pipelineId: '5f7639fb-10be-4376-ab54-9d2ac0c117f9',
      status: 'succeeded',
    });

    renderToolbar();
    const submitBtn = screen.getByRole('button', { name: /运行前确认/i });
    await act(async () => fireEvent.click(submitBtn));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '确认运行', exact: true })));

    const btn = await screen.findByRole('button', { name: /再次运行前确认/i });
    // The visible label must be a human status. A hex blob like "5f7639fb"
    // leaking into the button is exactly what the user complained about.
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
    expect(btn.textContent).toMatch(/再次运行前确认/i);
    expect(btn.textContent).not.toMatch(/[0-9a-f]{8}-/i);
    expect(btn.textContent).not.toMatch(/5f7639fb/i);
  });

  it('clears the localStorage draft after successful save without running', async () => {
    seedSubmitablePipeline();
    // Simulate a draft having been buffered during editing.
    saveDraft({ name: 'customer-sync', tenantId: 'test-tenant', nodes: usePipelineStore.getState().nodes, edges: [] });
    expect(loadDraft()).not.toBeNull();

    submitPipelineMock.mockResolvedValue({
      pipelineId: 'server-assigned-id',
      revision: 'saved-revision',
    });

    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() => expect(loadDraft()).toBeNull());
    expect(runPipelineMock).not.toHaveBeenCalled();
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
    runPipelineMock.mockReset();
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

describe('PipelineToolbar — multi-sink idempotency notice (ADR-016)', () => {
  beforeEach(() => {
    cleanup();
    useUIStore.getState().setValidationErrors([]);
    useUIStore.getState().setSubmitStatus('idle');
    submitPipelineMock.mockReset();
    runPipelineMock.mockReset();
    getExecutionMock.mockReset();
  });
  afterEach(cleanup);

  it('shows the idempotency warning when >=2 sinks are on the canvas', () => {
    usePipelineStore.getState().reset('test');
    usePipelineStore.setState({
      nodes: [
        { id: 'src', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'source', name: 'src', pluginId: 'p', componentId: 'source', pluginLabel: 'P', config: {}, isValid: true } },
        { id: 's1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'sink', name: 's1', pluginId: 'p', componentId: 'sink', pluginLabel: 'P', config: {}, isValid: true } },
        { id: 's2', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'sink', name: 's2', pluginId: 'p', componentId: 'sink', pluginLabel: 'P', config: {}, isValid: true } },
      ],
    });

    renderToolbar();
    expect(screen.getByText(/Multi-Sink fan-out/i)).toBeInTheDocument();
    expect(screen.getByText(/idempotent/i)).toBeInTheDocument();
  });

  it('does NOT show the warning for a single sink', () => {
    usePipelineStore.getState().reset('test');
    usePipelineStore.setState({
      nodes: [
        { id: 'src', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'source', name: 'src', pluginId: 'p', componentId: 'source', pluginLabel: 'P', config: {}, isValid: true } },
        { id: 's1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'sink', name: 's1', pluginId: 'p', componentId: 'sink', pluginLabel: 'P', config: {}, isValid: true } },
      ],
    });

    renderToolbar();
    expect(screen.queryByText(/Multi-Sink fan-out/i)).not.toBeInTheDocument();
  });
});

describe('PipelineToolbar transport errors are not execution outcomes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seedSavedPipeline();
    useUIStore.getState().setSubmitStatus('idle');
    useUIStore.getState().setSaveStatus('idle');
    runPipelineMock.mockReset();
    getExecutionMock.mockReset();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('keeps the last reported outcome on poll failure and resumes observation', async () => {
    runPipelineMock.mockResolvedValue({ executionId: 'exec-1', pipelineId: 'p1', status: 'running' });
    getExecutionMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      executionId: 'exec-1', pipelineId: 'p1', status: 'succeeded',
    });
    renderToolbar();
    await confirmToolbarRun();
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(screen.queryAllByText(/^Failed/)).toHaveLength(0);
    expect(screen.getByText(/status unavailable/i)).toBeInTheDocument();
    expect(useUIStore.getState().submitStatus).toBe('submitting');
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
    expect(screen.queryByText(/status unavailable/i)).not.toBeInTheDocument();
    expect(useUIStore.getState().submitStatus).toBe('success');
  });

  it('does not invent a failed execution when a submit response is lost', async () => {
    runPipelineMock.mockRejectedValue(new Error('network offline'));
    renderToolbar();
    await confirmToolbarRun();
    expect(screen.queryByText(/^Failed: network offline/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be confirmed/i);
  });

  it('does not report immediate backend failure as submit success', async () => {
    runPipelineMock.mockResolvedValue({ executionId: 'exec-1', pipelineId: 'p1', status: 'failed' });
    renderToolbar();
    await confirmToolbarRun();
    expect(useUIStore.getState().submitStatus).toBe('error');
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});

// When editing an existing pipeline (pipelineId already in the store), Submit
// must RUN it in place (runPipeline) rather than mint a duplicate
// (submitPipeline). Identity continuity: pipelineId must not change. Both
// paths return an executionId the polling UI consumes, so the success state
// should still surface the same way.
describe('PipelineToolbar — run in place when pipelineId is set', () => {
  beforeEach(() => {
    cleanup();
    useUIStore.getState().setSubmitStatus('idle');
    submitPipelineMock.mockReset();
    runPipelineMock.mockReset();
    getExecutionMock.mockReset();
  });
  afterEach(cleanup);

  it('calls runPipeline (not submitPipeline) and keeps pipelineId unchanged', async () => {
    seedSubmitablePipeline();
    markSaved('existing-pipeline-id');

    runPipelineMock.mockResolvedValue({
      executionId: 'exec-run-1',
      pipelineId: 'existing-pipeline-id',
      status: 'succeeded',
    });

    renderToolbar();
    await confirmToolbarRun();

    await waitFor(() => {
      // Identity preserved — no new id minted.
      expect(usePipelineStore.getState().pipelineId).toBe('existing-pipeline-id');
    });
    await waitFor(() => expect(runPipelineMock).toHaveBeenCalledWith('existing-pipeline-id', 'test-tenant', 'saved-revision', expect.any(String), {}));
    // Must NOT have created a duplicate via the create+run endpoint.
    expect(submitPipelineMock).not.toHaveBeenCalled();
  });

  it('requires saving before running a new pipeline', async () => {
    seedSubmitablePipeline();
    // A new pipeline can only be saved; Run must not create-and-run.
    usePipelineStore.setState({ pipelineId: null });

    submitPipelineMock.mockResolvedValue({
      pipelineId: 'freshly-minted-id',
      revision: 'saved-revision',
    });

    renderToolbar();
    expect(screen.getByRole('button', { name: '运行前确认' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() => expect(usePipelineStore.getState().pipelineId).toBe('freshly-minted-id'));
    expect(submitPipelineMock).toHaveBeenCalledTimes(1);
    expect(runPipelineMock).not.toHaveBeenCalled();
  });
});


// Exercise the real confirmation UI rather than approving a native dialog mock.
beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(false); });
afterEach(() => { vi.restoreAllMocks(); });

async function confirmToolbarRun() {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /运行前确认/i })));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '确认运行', exact: true })));
}

describe('PipelineToolbar confirmation boundary', () => {
  beforeEach(() => {
    cleanup();
    seedSavedPipeline();
    useUIStore.setState({ tenantId: 'test-tenant', submitStatus: 'idle' });
    submitPipelineMock.mockReset();
    runPipelineMock.mockReset();
    getExecutionMock.mockReset();
  });
  afterEach(cleanup);

  it.each(['p1', 'existing-pipeline-id'])('cancel preserves identity %s without creating an execution', async (pipelineId) => {
    markSaved(pipelineId);
    renderToolbar();
    const trigger = screen.getByRole('button', { name: /运行前确认/i });
    trigger.focus();
    await act(async () => fireEvent.click(trigger));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(submitPipelineMock).not.toHaveBeenCalled();
    expect(runPipelineMock).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '取消', exact: true })));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(submitPipelineMock).not.toHaveBeenCalled();
    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(usePipelineStore.getState().pipelineId).toBe(pipelineId);
    expect(useUIStore.getState().submitStatus).toBe('idle');
    expect(trigger).toHaveFocus();
  });

  it('Escape cancels and restores focus without dispatching', async () => {
    markSaved('confirmed-pipeline');
    renderToolbar();
    const trigger = screen.getByRole('button', { name: /运行前确认/i });
    trigger.focus();
    await act(async () => fireEvent.click(trigger));
    await act(async () => fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(submitPipelineMock).not.toHaveBeenCalled();
    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('dispatches only after explicit confirmation and never calls window.confirm', async () => {
    markSaved('confirmed-pipeline');
    runPipelineMock.mockResolvedValue({ executionId: 'confirmed-execution', pipelineId: 'confirmed-pipeline', status: 'succeeded' });
    renderToolbar();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /运行前确认/i })));
    expect(submitPipelineMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '取消', exact: true })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Tab' });
    expect(screen.getByRole('button', { name: '确认运行', exact: true })).toHaveFocus();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '确认运行', exact: true })));
    expect(runPipelineMock).toHaveBeenCalledTimes(1);
    expect(submitPipelineMock).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('does not allow execution with an unapplied invalid configuration edit', async () => {
    markSaved('confirmed-pipeline');
    renderToolbar();
    const invalid = document.createElement('textarea');
    invalid.dataset.configInvalid = 'true';
    document.body.appendChild(invalid);
    try {
      await act(async () => fireEvent.click(screen.getByRole('button', { name: /运行前确认/i })));
      expect(screen.getByRole('button', { name: '确认运行', exact: true })).toBeDisabled();
      await act(async () => fireEvent.click(screen.getByRole('button', { name: '取消', exact: true })));
      expect(submitPipelineMock).not.toHaveBeenCalled();
      expect(runPipelineMock).not.toHaveBeenCalled();
    } finally { invalid.remove(); }
  });
});
describe('PipelineToolbar saved revision and uncertain submissions', () => {
  beforeEach(() => {
    cleanup();
    seedSavedPipeline();
    submitPipelineMock.mockReset();
    runPipelineMock.mockReset();
    getExecutionMock.mockReset();
    useUIStore.getState().setValidationErrors([]);
  });
  afterEach(cleanup);

  it('saves an incomplete new draft while Run stays disabled', async () => {
    usePipelineStore.getState().reset('test-tenant');
    submitPipelineMock.mockResolvedValue({ pipelineId: 'incomplete', revision: 'r1' });
    renderToolbar();
    expect(screen.getByRole('button', { name: '运行前确认' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() => expect(usePipelineStore.getState().pipelineRevision).toBe('r1'));
    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '运行前确认' })).toBeDisabled();
  });

  it('blocks Run for unsaved changes, then uses the updated saved revision', async () => {
    usePipelineStore.getState().setName('edited');
    updatePipelineMock.mockResolvedValue({ pipelineId: 'p1', revision: 'r2' });
    renderToolbar();
    expect(screen.getByRole('button', { name: '运行前确认' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: '运行前确认' })).toBeEnabled());
    expect(updatePipelineMock).toHaveBeenCalledWith('p1', 'test-tenant', 'edited', expect.any(Object), 'saved-revision');
    runPipelineMock.mockResolvedValue({ pipelineId: 'p1', executionId: 'run-r2', status: 'succeeded' });
    await confirmToolbarRun();
    expect(runPipelineMock).toHaveBeenCalledWith('p1', 'test-tenant', 'r2', expect.any(String), {});
  });

  it('does not dispatch when the editor changes during confirmation', async () => {
    renderToolbar();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '运行前确认' })));
    act(() => usePipelineStore.getState().setName('changed while confirming'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '确认运行', exact: true })));
    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/确认期间任务已变化/);
  });

  it('queries the persisted request after remount without another run', async () => {
    runPipelineMock.mockRejectedValue(new Error('response lost'));
    const first = renderToolbar();
    await confirmToolbarRun();
    const originalRequest = runPipelineMock.mock.calls[0][3];
    expect(screen.getByRole('button', { name: '查询本次提交' })).toBeInTheDocument();
    first.unmount();
    getExecutionByRequestMock.mockResolvedValue({ executionId: 'original', pipelineId: 'p1', status: 'succeeded', definition: { revision: 'saved-revision' } });
    renderToolbar();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '查询本次提交' })));
    expect(getExecutionByRequestMock).toHaveBeenCalledWith(originalRequest, 'test-tenant');
    expect(runPipelineMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查询本次提交' })).not.toBeInTheDocument();
  });

  it('retains newer edits when an earlier save response arrives', async () => {
    usePipelineStore.getState().setName('submitted');
    let resolve!: (value: { pipelineId: string; revision: string }) => void;
    updatePipelineMock.mockReturnValue(new Promise(r => { resolve = r; }));
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    act(() => usePipelineStore.getState().setName('newer'));
    await act(async () => resolve({ pipelineId: 'p1', revision: 'r2' }));
    expect(usePipelineStore.getState().name).toBe('newer');
    expect(usePipelineStore.getState().pipelineRevision).toBe('r2');
    expect(screen.getByRole('button', { name: '运行前确认' })).toBeDisabled();
  });
});

describe('PipelineToolbar immutable connection confirmation', () => {
  const connection = (id: string, runtimeRevision: string): ConnectionResource => ({
    id, tenantId: 'test-tenant', driver: 'catalog-kind', name: id, parameters: { endpoint: 'fixture.test' },
    revision: 'editor-only-revision', runtimeRevision, version: 1, configuredSecrets: {}, ready: true,
  });
  beforeEach(() => {
    cleanup(); seedSavedPipeline(); submitPipelineMock.mockReset(); runPipelineMock.mockReset(); getExecutionMock.mockReset();
    useUIStore.getState().setValidationErrors([]);
  });
  afterEach(cleanup);

  it('captures a tenant superset before confirmation and never substitutes later connection versions', async () => {
    const resources = [connection('source-resource', 'runtime-1'), { ...connection('unused-legacy', 'legacy-runtime'), ready: false, migrationRequired: true }];
    getConnectionsMock.mockResolvedValue(resources);
    runPipelineMock.mockResolvedValue({ executionId: 'bound-run', pipelineId: 'p1', status: 'succeeded' });
    const persisted = vi.spyOn(Storage.prototype, 'setItem');
    renderToolbar();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '运行前确认' })));
    expect(getConnectionsMock).toHaveBeenCalledWith('test-tenant');
    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('已捕获 2 项租户连接版本');
    resources[0].runtimeRevision = 'changed-after-confirmation-opened';
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '确认运行', exact: true })));
    expect(runPipelineMock).toHaveBeenCalledWith('p1', 'test-tenant', 'saved-revision', expect.any(String), {
      'source-resource': 'runtime-1', 'unused-legacy': 'legacy-runtime',
    });
    expect(getConnectionsMock).toHaveBeenCalledTimes(1);
    const pending = persisted.mock.calls.find(([key]) => key.startsWith('planx:pending-run:'));
    expect(JSON.parse(pending![1]).expectedConnections).toEqual({ 'source-resource': 'runtime-1', 'unused-legacy': 'legacy-runtime' });
    expect(pending![1]).not.toContain('fixture.test');
    expect(pending![1]).not.toContain('editor-only-revision');
  });

  it('does not open confirmation or submit when connection metadata cannot be read', async () => {
    getConnectionsMock.mockRejectedValue(new Error('metadata unavailable'));
    renderToolbar();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '运行前确认' })));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('本次没有发送新的运行请求');
    expect(sessionStorage.length).toBe(0);
  });

  it.each(['name', 'tenant', 'revision', 'editor'])('discards a connection preflight after the %s changes', async (change) => {
    let resolve!: (resources: ConnectionResource[]) => void;
    getConnectionsMock.mockReturnValue(new Promise<ConnectionResource[]>((done) => { resolve = done; }));
    renderToolbar();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '运行前确认' })));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    act(() => {
      if (change === 'name') usePipelineStore.getState().setName('newer draft');
      if (change === 'tenant') usePipelineStore.setState({ tenantId: 'other-tenant' });
      if (change === 'revision') usePipelineStore.setState({ pipelineRevision: 'newer-revision' });
      if (change === 'editor') usePipelineStore.getState().reset('test-tenant');
    });
    await act(async () => resolve([connection('source-resource', 'runtime-1')]));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it('queries the original request after a lost response without fetching or replaying refreshed bindings', async () => {
    getConnectionsMock.mockResolvedValue([connection('source-resource', 'runtime-original')]);
    runPipelineMock.mockRejectedValue(new Error('response lost'));
    const first = renderToolbar(); await confirmToolbarRun();
    const requestId = runPipelineMock.mock.calls[0][3];
    expect(runPipelineMock.mock.calls[0][4]).toEqual({ 'source-resource': 'runtime-original' });
    first.unmount();
    getConnectionsMock.mockResolvedValue([connection('source-resource', 'runtime-new')]);
    getExecutionByRequestMock.mockResolvedValue({
      executionId: 'original', pipelineId: 'p1', status: 'succeeded', definition: { revision: 'saved-revision' },
    });
    renderToolbar();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '查询本次提交' })));
    expect(getExecutionByRequestMock).toHaveBeenCalledWith(requestId, 'test-tenant');
    expect(getConnectionsMock).toHaveBeenCalledTimes(1);
    expect(runPipelineMock).toHaveBeenCalledTimes(1);
  });
});

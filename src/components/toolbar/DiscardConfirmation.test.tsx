import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { PipelineToolbar } from './PipelineToolbar';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { loadDraft, saveDraft } from '@/lib/draft';
import { parseJson } from '@/lib/json';
import type { PipelineNode } from '@/types/node';

let fetchMock: ReturnType<typeof vi.fn>;
let nativeConfirm: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  usePipelineStore.getState().reset('workbench-final-Q76jPR');
  const nodes: PipelineNode[] = ['mapping', 'lookup'].map((id) => ({
    id, type: 'pipelineNode', position: { x: 20, y: 30 }, data: {
      nodeType: 'processor', name: id, pluginId: 'records', componentId: id, pluginLabel: id, isValid: true,
      config: parseJson('{"exact":9007199254740993,"mappings":[{"target":"amount","expression":"-record.amount"}]}') as Record<string, unknown>,
    },
  }));
  const edges = [{ id: 'mapping-lookup', source: 'mapping', target: 'lookup' }];
  const name = '字段配置交互示例（未运行）';
  usePipelineStore.setState({ name, nodes, edges, pipelineId: 'saved-identity',
    _past: [{ name: 'before', nodes, edges }], _future: [{ name: 'after', nodes, edges }] });
  useUIStore.setState({ selectedNodeId: 'mapping', showPreview: true, submitStatus: 'idle', saveStatus: 'idle', validationErrors: [] });
  saveDraft({ name, tenantId: 'workbench-final-Q76jPR', nodes, edges });
  localStorage.setItem('unrelated-task-cache', 'keep');
  localStorage.setItem('planx-admin:tenant', 'workbench-final-Q76jPR');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const renderToolbar = () => render(<MemoryRouter><PipelineToolbar /></MemoryRouter>);
function open() {
  const button = screen.getByRole('button', { name: 'Start a new pipeline' });
  button.focus(); fireEvent.click(button); return button;
}
async function cancelDialog() {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '取消', exact: true })));
}

it('opens a dedicated discard dialog without invoking native confirm or dispatching any request', async () => {
  renderToolbar(); open();
  expect(nativeConfirm).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog', { name: '丢弃当前草稿？' })).toBeInTheDocument();
  expect(screen.getByText(/仅清空当前浏览器中的任务草稿与画布/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '确认运行', exact: true })).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled(); await cancelDialog();
});

it.each(['cancel', 'escape', 'backdrop'])('%s preserves the full graph, config, identity, history, modes and browser draft, and restores focus', async (action) => {
  renderToolbar();
  const before = usePipelineStore.getState(); const uiBefore = useUIStore.getState();
  const storage = { ...localStorage }; const trigger = open();
  const dialog = screen.getByRole('alertdialog');
  if (action === 'cancel') await cancelDialog();
  if (action === 'escape') await act(async () => fireEvent.keyDown(dialog, { key: 'Escape' }));
  if (action === 'backdrop') await act(async () => fireEvent.click(dialog.parentElement!));
  expect(usePipelineStore.getState()).toBe(before); expect(useUIStore.getState()).toBe(uiBefore);
  expect({ ...localStorage }).toEqual(storage);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  expect(fetchMock).not.toHaveBeenCalled(); expect(nativeConfirm).not.toHaveBeenCalled();
});

it('only explicit discard clears local nodes, edges, pipeline identity and undo history while retaining the current tenant', async () => {
  useUIStore.setState({ validationErrors: ['old error'], submitStatus: 'error', submitResult: { error: 'old' }, saveStatus: 'error', saveError: 'old' });
  renderToolbar(); const trigger = open();
  expect(loadDraft()).not.toBeNull();
  expect(usePipelineStore.getState().pipelineId).toBe('saved-identity');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '丢弃并新建', exact: true })));
  expect(usePipelineStore.getState()).toMatchObject({ name: '', tenantId: 'workbench-final-Q76jPR', pipelineId: null, nodes: [], edges: [], _past: [], _future: [] });
  expect(useUIStore.getState()).toMatchObject({ validationErrors: [], submitStatus: 'idle', submitResult: null, saveStatus: 'idle', saveError: null });
  expect(loadDraft()).toBeNull();
  expect(localStorage.getItem('unrelated-task-cache')).toBe('keep');
  expect(localStorage.getItem('planx-admin:tenant')).toBe('workbench-final-Q76jPR');
  expect(trigger).toHaveFocus(); expect(fetchMock).not.toHaveBeenCalled(); expect(nativeConfirm).not.toHaveBeenCalled();
});

it('focuses Cancel by default, traps forward and reverse Tab, and restores preexisting inert states', async () => {
  const inertSibling = document.createElement('div'); inertSibling.inert = true; document.body.appendChild(inertSibling);
  const { container } = renderToolbar(); container.inert = false; const trigger = open();
  const dialog = screen.getByRole('alertdialog');
  const cancel = screen.getByRole('button', { name: '取消', exact: true });
  const discard = screen.getByRole('button', { name: '丢弃并新建', exact: true });
  expect(cancel).toHaveFocus(); expect(container.inert).toBe(true); expect(inertSibling.inert).toBe(true);
  fireEvent.keyDown(dialog, { key: 'Tab' }); expect(discard).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab' }); expect(cancel).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true }); expect(discard).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true }); expect(cancel).toHaveFocus();
  await cancelDialog();
  expect(container.inert).toBe(false); expect(inertSibling.inert).toBe(true); expect(trigger).toHaveFocus();
  inertSibling.remove();
});

it('does not treat clicks inside the dialog as backdrop cancellation', async () => {
  renderToolbar(); open(); fireEvent.click(screen.getByRole('heading', { name: '丢弃当前草稿？' }));
  expect(screen.getByRole('alertdialog')).toBeInTheDocument(); expect(loadDraft()).not.toBeNull();
  await cancelDialog();
});

it('prevents duplicate discard dialogs while a decision is pending', async () => {
  renderToolbar(); const trigger = open(); fireEvent.click(trigger);
  expect(screen.getAllByRole('alertdialog')).toHaveLength(1); expect(loadDraft()).not.toBeNull();
  await cancelDialog(); expect(usePipelineStore.getState().nodes).toHaveLength(2);
});

it('retains an empty tenant instead of silently moving New to another workspace', async () => {
  usePipelineStore.getState().setTenantId(''); renderToolbar(); open();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '丢弃并新建', exact: true })));
  expect(usePipelineStore.getState().tenantId).toBe(''); expect(fetchMock).not.toHaveBeenCalled();
});

it('retains the existing empty-canvas New behavior without opening a native dialog', async () => {
  usePipelineStore.getState().reset('workbench-final-Q76jPR'); renderToolbar();
  await act(async () => { open(); });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(usePipelineStore.getState().tenantId).toBe('workbench-final-Q76jPR');
  expect(nativeConfirm).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
});

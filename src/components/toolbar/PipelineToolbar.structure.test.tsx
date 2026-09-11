import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { PipelineToolbar } from './PipelineToolbar';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { stringifyJson } from '@/lib/json';
import type { PipelineNode } from '@/types/node';

const node = (id: string, kind: 'source' | 'processor' | 'sink'): PipelineNode => ({ id, type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: kind, name: id, pluginId: 'p', componentId: kind, pluginLabel: id, config: {}, isValid: true } });
beforeEach(() => { sessionStorage.clear(); usePipelineStore.getState().reset('test'); useUIStore.setState({ submitStatus: 'idle', saveStatus: 'idle', validationErrors: [] }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(['processors-only', 'missing-sink', 'unconnected-sink', 'unconnected-processor'])('disables and explains Run for %s without altering the draft', (kind) => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const nodes = kind === 'processors-only' ? [node('mapping', 'processor'), node('lookup', 'processor')]
    : kind === 'missing-sink' ? [node('source', 'source'), node('mapping', 'processor')]
    : [node('source', 'source'), node('sink', 'sink'), ...(kind === 'unconnected-processor' ? [node('mapping', 'processor')] : [])];
  usePipelineStore.setState({ name: '字段配置交互示例（未运行）', nodes, edges: kind === 'unconnected-processor' ? [{ id: 'e', source: 'source', target: 'sink' }] : [] });
  render(<MemoryRouter><PipelineToolbar /></MemoryRouter>);
  const run = screen.getByRole('button', { name: '运行前确认' }); expect(run).toBeDisabled();
  expect(screen.getByText(/运行前请完善/)).toBeInTheDocument(); fireEvent.click(run);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
  expect(usePipelineStore.getState().nodes).toBe(nodes); expect(usePipelineStore.getState().name).toBe('字段配置交互示例（未运行）');
});

it('retains Run for a structurally valid required-sink fan-out', () => {
  usePipelineStore.setState({ name: 'valid', nodes: [node('source', 'source'), node('sink', 'sink'), node('second', 'sink')], edges: [{ id: 'a', source: 'source', target: 'sink' }, { id: 'b', source: 'source', target: 'second' }] });
  const state = usePipelineStore.getState();
  state.acceptSaved(state.editorId, state.tenantId, 'p1', 'r1', stringifyJson(state.buildSpec()));
  render(<MemoryRouter><PipelineToolbar /></MemoryRouter>);
  expect(screen.getByRole('button', { name: '运行前确认' })).toBeEnabled();
});

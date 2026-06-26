import { describe, it, expect, beforeEach } from 'vitest';
import type { NodeChange } from '@xyflow/react';
import { usePipelineStore } from './usePipelineStore';
import type { PipelineNode } from '@/types/node';

function makeNode(id: string, type: 'source' | 'processor' | 'sink'): PipelineNode {
  return {
    id,
    type: 'pipelineNode',
    position: { x: 0, y: 0 },
    data: {
      nodeType: type,
      name: id,
      plugin: 'test-plugin',
      pluginLabel: 'Test',
      config: {},
      isValid: true,
    },
  };
}

describe('usePipelineStore — DAG node drag (dag-designer.md §5.5)', () => {
  beforeEach(() => {
    usePipelineStore.getState().reset('test');
    usePipelineStore.setState({
      nodes: [
        makeNode('src', 'source'),
        makeNode('proc', 'processor'),
        makeNode('snk', 'sink'),
      ],
    });
  });

  it('applyNodeChanges updates node position when dragged', () => {
    const { applyNodeChanges } = usePipelineStore.getState();

    // Simulate ReactFlow's position change event
    const changes: NodeChange[] = [
      {
        type: 'position',
        id: 'proc',
        position: { x: 300, y: 200 },
        dragging: false,
      },
    ];

    applyNodeChanges(changes);

    const proc = usePipelineStore.getState().nodes.find((n) => n.id === 'proc');
    expect(proc?.position).toEqual({ x: 300, y: 200 });
  });

  it('applyNodeChanges does not alter nodes not in the change set', () => {
    const { applyNodeChanges } = usePipelineStore.getState();

    applyNodeChanges([
      { type: 'position', id: 'proc', position: { x: 999, y: 999 }, dragging: false },
    ]);

    const src = usePipelineStore.getState().nodes.find((n) => n.id === 'src');
    expect(src?.position).toEqual({ x: 0, y: 0 });
  });

  // dag-designer.md §5.2: dragging from Palette → Canvas creates a node at the
  // drop position.
  it('addNodeAt creates a node at the given position', () => {
    usePipelineStore.getState().reset('test');
    const { addNodeAt } = usePipelineStore.getState();

    const node = addNodeAt('source', 'source-hello', 'Source Hello', 250, 150);

    expect(node.position).toEqual({ x: 250, y: 150 });
    expect(node.data.nodeType).toBe('source');
    expect(node.data.plugin).toBe('source-hello');

    const stored = usePipelineStore.getState().nodes.find((n) => n.id === node.id);
    expect(stored?.position).toEqual({ x: 250, y: 150 });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import type { NodeChange } from '@xyflow/react';
import { usePipelineStore } from './usePipelineStore';
import { stringifyJson } from '@/lib/json';
import type { PipelineNode } from '@/types/node';

function makeNode(id: string, type: 'source' | 'processor' | 'sink'): PipelineNode {
  return {
    id,
    type: 'pipelineNode',
    position: { x: 0, y: 0 },
    data: {
      nodeType: type,
      name: id,
      pluginId: 'test-plugin',
      componentId: type,
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

    const node = addNodeAt('source', 'source-hello', 'source', 'Source Hello', 250, 150);

    expect(node.position).toEqual({ x: 250, y: 150 });
    expect(node.data.nodeType).toBe('source');
    expect(node.data.pluginId).toBe('source-hello');
    expect(node.data.componentId).toBe('source');

    const stored = usePipelineStore.getState().nodes.find((n) => n.id === node.id);
    expect(stored?.position).toEqual({ x: 250, y: 150 });
  });
});

// Draft loading preserves authored topology. Only explicit node deletion
// cascades edges; structural errors stay visible and block execution.

describe('canvas state invariants — dangling edges', () => {
  beforeEach(() => {
    usePipelineStore.getState().reset('test');
  });

  it('restoreDraft preserves invalid authored edges for repair', () => {
    usePipelineStore.getState().restoreDraft({
      name: 'corrupt',
      tenantId: 't',
      nodes: [makeNode('src', 'source'), makeNode('snk', 'sink')],
      edges: [
        { id: 'e1', source: 'a0901b91-dce9-4bd8-950e-9b7acaffc122', target: 'proc-1' }, // dangling
        { id: 'e2', source: 'src', target: 'snk' }, // valid
      ],
    });
    const s = usePipelineStore.getState();
    expect(s.edges).toEqual([{ id: 'e1', source: 'a0901b91-dce9-4bd8-950e-9b7acaffc122', target: 'proc-1' }, { id: 'e2', source: 'src', target: 'snk' }]);
    expect(s.validate().valid).toBe(false);
  });

  it('loadSpec preserves dangling references and blocks execution', () => {
    usePipelineStore.getState().loadSpec({
      apiVersion: 'planx/v4',
      kind: 'Pipeline',
      metadata: { name: 'x', tenantId: 't' },
      spec: {
        nodes: [
          { id: 'src', kind: 'source', plugin_id: 'p', component_id: 'c' },
          { id: 'snk', kind: 'sink', plugin_id: 'p', component_id: 'c' },
        ],
        edges: [
          { from: 'src', to: 'ghost' }, // dangling
          { from: 'src', to: 'snk' }, // valid
        ],
      },
    });
    const s = usePipelineStore.getState();
    expect(s.edges.map(e => [e.source, e.target])).toEqual([['src', 'ghost'], ['src', 'snk']]);
    expect(s.validate().valid).toBe(false);
  });

  it('applyNodeChanges cascades edge deletion on keyboard remove (T4)', () => {
    usePipelineStore.setState({
      nodes: [makeNode('src', 'source'), makeNode('proc', 'processor'), makeNode('snk', 'sink')],
      edges: [
        { id: 'e1', source: 'src', target: 'proc' },
        { id: 'e2', source: 'proc', target: 'snk' },
      ],
    });
    // Simulate ReactFlow Backspace/Delete on the processor node
    const removeChange = [{ id: 'proc', type: 'remove' as const }];
    usePipelineStore.getState().applyNodeChanges(removeChange);
    const s = usePipelineStore.getState();
    expect(s.nodes.find((n) => n.id === 'proc')).toBeUndefined();
    // Both edges touching proc must be gone (no dangling)
    expect(s.edges).toEqual([]);
  });

  it('validate never reports "node not found" after a delete (T12)', () => {
    usePipelineStore.setState({
      nodes: [makeNode('src', 'source'), makeNode('snk', 'sink')],
      edges: [{ id: 'e1', source: 'src', target: 'snk' }],
    });
    const result = usePipelineStore.getState().validate();
    const hasNodeNotFound = result.errors.some((e) => e.includes('not found'));
    expect(hasNodeNotFound).toBe(false);
  });
});

// ── Multi-Sink (ADR-016): the canvas must allow ≥1 sink, appending rather
// than replacing. Source cardinality stays exactly-1 (replace). ──

describe('usePipelineStore — multi-sink (ADR-016)', () => {
  beforeEach(() => {
    usePipelineStore.getState().reset('test');
  });

  it('addNode appends a second sink instead of replacing (fan-out)', () => {
    const { addNode } = usePipelineStore.getState();
    addNode('sink', 'sink-stdout', 'sink', 'Stdout', );
    addNode('sink', 'sink-stdout', 'sink', 'Stdout', );

    const sinks = usePipelineStore.getState().nodes.filter((n) => n.data.nodeType === 'sink');
    expect(sinks).toHaveLength(2);
  });

  it('addNodeAt appends a second sink instead of replacing', () => {
    const { addNodeAt } = usePipelineStore.getState();
    addNodeAt('sink', 'sink-stdout', 'sink', 'Stdout', 10, 20);
    addNodeAt('sink', 'sink-stdout', 'sink', 'Stdout', 30, 40);

    const sinks = usePipelineStore.getState().nodes.filter((n) => n.data.nodeType === 'sink');
    expect(sinks).toHaveLength(2);
  });

  it('addNode still REPLACES an existing source (cardinality unchanged)', () => {
    const { addNode } = usePipelineStore.getState();
    addNode('source', 'source-hello', 'source', 'Hello', );
    addNode('source', 'source-hello', 'source', 'Hello', );

    const sources = usePipelineStore.getState().nodes.filter((n) => n.data.nodeType === 'source');
    expect(sources).toHaveLength(1);
  });
});
describe('saved revision ownership', () => {
  beforeEach(() => usePipelineStore.getState().reset('test'));
  it('records a saved base without overwriting edits made in flight', () => {
    const state = usePipelineStore.getState();
    const submitted = stringifyJson(state.buildSpec());
    state.setName('newer edit');
    expect(state.acceptSaved(state.editorId, 'test', 'p1', 'r1', submitted)).toBe(true);
    expect(usePipelineStore.getState().name).toBe('newer edit');
    expect(usePipelineStore.getState().savedFingerprint).not.toBe(stringifyJson(usePipelineStore.getState().buildSpec()));
  });
  it('ignores a save response belonging to a replaced editor', () => {
    const previous = usePipelineStore.getState();
    previous.reset('other');
    expect(previous.acceptSaved(previous.editorId, 'test', 'p1', 'r1', '{}')).toBe(false);
    expect(usePipelineStore.getState().pipelineId).toBeNull();
    expect(usePipelineStore.getState().pipelineRevision).toBeNull();
  });
  it('loads the saved revision and clears its identity on restore/reset', () => {
    const state = usePipelineStore.getState();
    state.loadSpec(state.buildSpec(), 'p1', 'r1');
    expect(usePipelineStore.getState().pipelineRevision).toBe('r1');
    expect(usePipelineStore.getState().savedFingerprint).toBe(stringifyJson(usePipelineStore.getState().buildSpec()));
    state.restoreDraft({ name: 'local', tenantId: 'test', nodes: [], edges: [] });
    expect(usePipelineStore.getState().pipelineId).toBeNull();
    expect(usePipelineStore.getState().pipelineRevision).toBeNull();
  });
});

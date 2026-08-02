import { describe, it, expect } from 'vitest';
import { buildSpec, fromSpec, validateSpec, generateNodeName } from './pipeline';
import type { PipelineNode, PipelineNodeData } from '@/types/node';
import type { Edge } from '@xyflow/react';
import { API_VERSION } from '@/types/pipeline';

// ── Fixtures ─────────────────────────────────────────────

function makeNode(
  data: Partial<PipelineNodeData> & { nodeType: PipelineNodeData['nodeType'] },
  id: string,
): PipelineNode {
  return {
    id,
    type: 'pipelineNode',
    position: { x: 0, y: 0 },
    data: {
      name: data.name ?? id,
      pluginId: data.pluginId ?? 'p',
      componentId: data.componentId ?? data.nodeType,
      pluginLabel: data.pluginLabel ?? data.pluginId ?? 'p',
      config: data.config ?? {},
      isValid: true,
      ...data,
    },
  };
}

const baseNodes = (): PipelineNode[] => [
  makeNode({ nodeType: 'source', name: 'src', pluginId: 'source-hello', componentId: 'source' }, 'src'),
  makeNode({ nodeType: 'processor', name: 'proc', pluginId: 'p', pluginLabel: 'P', componentId: 'processor' }, 'proc'),
  makeNode({ nodeType: 'sink', name: 'snk', pluginId: 'sink-stdout', componentId: 'sink' }, 'snk'),
];

const baseEdges = (): Edge[] => [
  { id: 'e1', source: 'src', target: 'proc' },
  { id: 'e2', source: 'proc', target: 'snk' },
];

// ── buildSpec (DAG) ──────────────────────────────────────

describe('buildSpec (DAG)', () => {
  it('produces a valid PipelineSpec v4 envelope', () => {
    const spec = buildSpec(baseNodes(), baseEdges(), { name: 'demo', tenantId: 't1' });
    expect(spec.apiVersion).toBe(API_VERSION);
    expect(spec.kind).toBe('Pipeline');
    expect(spec.metadata).toEqual({ name: 'demo', tenantId: 't1' });
  });

  it('produces nodes + edges with correct ids/kinds/plugins', () => {
    const spec = buildSpec(baseNodes(), baseEdges(), { name: 'p', tenantId: 't' });
    expect(spec.spec.nodes).toHaveLength(3);
    expect(spec.spec.nodes[0]).toMatchObject({ id: 'src', kind: 'source', plugin_id: 'source-hello', component_id: 'source' });
    expect(spec.spec.nodes[1]).toMatchObject({ id: 'proc', kind: 'processor', plugin_id: 'p', component_id: 'processor' });
    expect(spec.spec.nodes[2]).toMatchObject({ id: 'snk', kind: 'sink', plugin_id: 'sink-stdout', component_id: 'sink' });
    expect(spec.spec.edges).toHaveLength(2);
    expect(spec.spec.edges[0]).toEqual({ from: 'src', to: 'proc' });
    expect(spec.spec.edges[1]).toEqual({ from: 'proc', to: 'snk' });
  });

  it('omits empty config objects', () => {
    const nodes = [
      makeNode({ nodeType: 'source', pluginId: 's', componentId: 'source', config: {} }, 'src'),
      makeNode({ nodeType: 'sink', pluginId: 'k', componentId: 'sink', config: { a: 1 } }, 'snk'),
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'src', target: 'snk' }];
    const spec = buildSpec(nodes, edges, { name: 'd', tenantId: 't' });
    expect(spec.spec.nodes[0].config).toBeUndefined();
    expect(spec.spec.nodes[1].config).toEqual({ a: 1 });
  });

  it('uses the node name (not the ReactFlow UUID) as spec id — dag-designer.md §4.3', () => {
    // Real runtime: ReactFlow node.id is crypto.randomUUID() (often digit-leading),
    // data.name is the generated src-1/proc-1/snk-1. The spec id MUST be the human
    // name, else validateSpec's NODE_ID_RE (^[a-zA-Z]) rejects digit-leading UUIDs
    // and Submit is blocked.
    const nodes: PipelineNode[] = [
      makeNode({ nodeType: 'source', name: 'src-1', pluginId: 'source-hello', componentId: 'source' }, '8ed69e45-aaaa'),
      makeNode({ nodeType: 'processor', name: 'proc-1', pluginId: 'p', componentId: 'processor' }, 'f54ddb0c-bbbb'),
      makeNode({ nodeType: 'sink', name: 'snk-1', pluginId: 'sink-stdout', componentId: 'sink' }, '02912054-cccc'),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: '8ed69e45-aaaa', target: 'f54ddb0c-bbbb' },
      { id: 'e2', source: 'f54ddb0c-bbbb', target: '02912054-cccc' },
    ];
    const spec = buildSpec(nodes, edges, { name: 'demo', tenantId: 't1' });
    expect(spec.spec.nodes.map((n) => n.id)).toEqual(['src-1', 'proc-1', 'snk-1']);
    expect(spec.spec.edges).toEqual([
      { from: 'src-1', to: 'proc-1' },
      { from: 'proc-1', to: 'snk-1' },
    ]);
    expect(validateSpec(spec).valid).toBe(true);
  });
});

// ── fromSpec (DAG round-trip) ────────────────────────────

describe('fromSpec (DAG)', () => {
  it('round-trips nodes + edges', () => {
    const spec = buildSpec(baseNodes(), baseEdges(), { name: 'p', tenantId: 't' });
    const back = fromSpec(spec);
    expect(back.nodes).toHaveLength(3);
    expect(back.nodes[0].id).toBe('src');
    expect(back.nodes[0].data.nodeType).toBe('source');
    expect(back.nodes[0].data.pluginId).toBe('source-hello');
    expect(back.nodes[2].id).toBe('snk');
    expect(back.nodes[2].data.nodeType).toBe('sink');
    expect(back.edges).toHaveLength(2);
    expect(back.edges[0].source).toBe('src');
    expect(back.edges[0].target).toBe('proc');
    expect(back.edges[1].source).toBe('proc');
    expect(back.edges[1].target).toBe('snk');
  });

  // Canvas nodes must show the plugin's human-readable displayName (e.g.
  // "PostgreSQL Source"), not its internal id ("postgres"). fromSpec resolves
  // the label via an optional plugin index supplied by the caller (the palette
  // store); when absent it falls back to plugin_id so the function stays pure
  // and testable without a store. (user-scenario-analysis.md P0-3)
  it('uses pluginIndex to resolve pluginLabel to a displayName', () => {
    const spec = buildSpec(baseNodes(), baseEdges(), { name: 'p', tenantId: 't' });
    const index = new Map([
      ['source-hello', { displayName: 'Hello Source Connector' }],
      ['sink-stdout', { displayName: 'Stdout Sink' }],
    ]);
    const back = fromSpec(spec, index);
    const src = back.nodes.find((n) => n.data.pluginId === 'source-hello')!;
    const snk = back.nodes.find((n) => n.data.pluginId === 'sink-stdout')!;
    expect(src.data.pluginLabel).toBe('Hello Source Connector');
    expect(snk.data.pluginLabel).toBe('Stdout Sink');
  });

  it('falls back to plugin_id when no index is provided (no crash, stays pure)', () => {
    const spec = buildSpec(baseNodes(), baseEdges(), { name: 'p', tenantId: 't' });
    const back = fromSpec(spec);
    const src = back.nodes.find((n) => n.data.pluginId === 'source-hello')!;
    expect(src.data.pluginLabel).toBe('source-hello');
  });

  it('falls back to plugin_id when the plugin is not in the index', () => {
    const spec = buildSpec(baseNodes(), baseEdges(), { name: 'p', tenantId: 't' });
    const index = new Map([['some-other-plugin', { displayName: 'Other' }]]);
    const back = fromSpec(spec, index);
    const src = back.nodes.find((n) => n.data.pluginId === 'source-hello')!;
    expect(src.data.pluginLabel).toBe('source-hello');
  });
});

// ── validateSpec (DAG) ───────────────────────────────────

describe('validateSpec (DAG)', () => {
  const valid = () => buildSpec(baseNodes(), baseEdges(), { name: 'p', tenantId: 't' });

  it('accepts a valid DAG', () => {
    expect(validateSpec(valid()).valid).toBe(true);
    expect(validateSpec(valid()).errors).toEqual([]);
  });

  it('flags missing pipeline name', () => {
    const s = valid();
    s.metadata.name = '';
    const r = validateSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Pipeline name'))).toBe(true);
  });

  it('rejects a cycle', () => {
    const s = valid();
    s.spec.edges.push({ from: 'snk', to: 'src' }); // src->proc->snk->src cycle
    expect(validateSpec(s).errors.join(' ')).toMatch(/cycle/i);
  });

  it('rejects two sources', () => {
    const s = valid();
    s.spec.nodes[1].kind = 'source'; // proc becomes a 2nd source
    expect(validateSpec(s).errors.join(' ')).toMatch(/source/i);
  });

  it('rejects a dangling edge', () => {
    const s = valid();
    s.spec.edges.push({ from: 'ghost', to: 'snk' });
    expect(validateSpec(s).errors.join(' ')).toMatch(/not found/i);
  });

  it('rejects duplicate node id', () => {
    const s = valid();
    s.spec.nodes.push({ id: 'src', kind: 'processor', plugin_id: 'p', component_id: 'processor' });
    expect(validateSpec(s).errors.join(' ')).toMatch(/duplicate/i);
  });

  it('rejects missing component_id', () => {
    const s = valid();
    s.spec.nodes[0].component_id = '';
    const r = validateSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('component_id'))).toBe(true);
  });

  it('returns ALL errors, not just the first', () => {
    const s = valid();
    s.metadata.name = '';
    s.metadata.tenantId = '';
    const r = validateSpec(s);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ── generateNodeName ─────────────────────────────────────

describe('generateNodeName', () => {
  it('produces type-prefixed names', () => {
    expect(generateNodeName('source', [])).toBe('src-1');
    expect(generateNodeName('processor', [])).toBe('proc-1');
    expect(generateNodeName('sink', [])).toBe('snk-1');
  });

  it('increments to avoid collisions', () => {
    expect(generateNodeName('processor', ['proc-1'])).toBe('proc-2');
    expect(generateNodeName('processor', ['proc-1', 'proc-2'])).toBe('proc-3');
  });
});

// ── Dangling-edge defense (T11): buildSpec must never emit a spec with
// edges referencing non-existent nodes. This is the submit-time guard that
// makes "node not found" + spurious "cycle" errors impossible. ──

describe('buildSpec — dangling-edge defense', () => {
  it('drops edges whose source node was deleted', () => {
    // proc was deleted but an edge still references it (corrupted state)
    const nodes = [makeNode({ nodeType: 'source', name: 'src' }, 'src'), makeNode({ nodeType: 'sink', name: 'snk' }, 'snk')];
    const edges = [
      { id: 'e1', source: 'src', target: 'proc' }, // dangling target 'proc'
      { id: 'e2', source: 'ghost-uuid', target: 'snk' }, // dangling source
      { id: 'e3', source: 'src', target: 'snk' }, // valid
    ];
    const spec = buildSpec(nodes, edges, { name: 'x', tenantId: 't' });
    expect(spec.spec.edges).toEqual([{ from: 'src', to: 'snk' }]);
  });

  it('emits zero edges when all edges are dangling', () => {
    const nodes = [makeNode({ nodeType: 'source', name: 'src' }, 'src')];
    const edges = [{ id: 'e1', source: 'a', target: 'b' }];
    const spec = buildSpec(nodes, edges, { name: 'x', tenantId: 't' });
    expect(spec.spec.edges).toEqual([]);
  });
});

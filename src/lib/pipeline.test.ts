import { describe, it, expect } from 'vitest';
import {
  buildSpec,
  fromSpec,
  validateSpec,
  computeLinearOrder,
  generateNodeName,
} from './pipeline';
import { computeEdges, computeLayout } from './edges';
import type { PipelineNode, PipelineNodeData } from '@/types/node';
import type { PipelineSpec } from '@/types/pipeline';

// ── Helpers ──────────────────────────────────────────────

let idCounter = 0;
const id = () => `node-${idCounter++}`;

function makeNode(
  data: Partial<PipelineNodeData> & { nodeType: PipelineNodeData['nodeType'] },
  order: number,
): PipelineNode {
  return {
    id: id(),
    type: 'pipelineNode',
    position: { x: 0, y: 0 },
    data: {
      name: data.name ?? 'n',
      plugin: data.plugin ?? 'p',
      pluginLabel: data.pluginLabel ?? data.plugin ?? 'p',
      config: data.config ?? {},
      isValid: true,
      _order: order,
      ...data,
    },
  };
}

const baseNodes = (): PipelineNode[] => [
  makeNode({ nodeType: 'source', name: 'src', plugin: 'source-hello' }, 0),
  makeNode({ nodeType: 'sink', name: 'snk', plugin: 'sink-stdout' }, 1),
];

// ── buildSpec ────────────────────────────────────────────

describe('buildSpec', () => {
  it('produces a valid PipelineSpec v4 envelope', () => {
    const spec = buildSpec(baseNodes(), { name: 'demo', tenantId: 't1' });
    expect(spec.apiVersion).toBe('planx.io/v4');
    expect(spec.kind).toBe('Pipeline');
    expect(spec.metadata).toEqual({ name: 'demo', tenantId: 't1' });
  });

  it('omits processors when none present', () => {
    const spec = buildSpec(baseNodes(), { name: 'demo', tenantId: 't1' });
    expect(spec.spec.processors).toBeUndefined();
  });

  it('orders processors by _order and includes them', () => {
    const nodes = [
      makeNode({ nodeType: 'source', name: 'src', plugin: 's' }, 0),
      makeNode({ nodeType: 'processor', name: 'p2', plugin: 'p2' }, 3),
      makeNode({ nodeType: 'processor', name: 'p1', plugin: 'p1' }, 1),
      makeNode({ nodeType: 'sink', name: 'snk', plugin: 'k' }, 2),
    ];
    const spec = buildSpec(nodes, { name: 'd', tenantId: 't' });
    expect(spec.spec.processors?.map((p) => p.name)).toEqual(['p1', 'p2']);
  });

  it('omits empty config objects', () => {
    const nodes = [
      makeNode({ nodeType: 'source', name: 'src', plugin: 's', config: {} }, 0),
      makeNode({ nodeType: 'sink', name: 'snk', plugin: 'k', config: { a: 1 } }, 1),
    ];
    const spec = buildSpec(nodes, { name: 'd', tenantId: 't' });
    expect(spec.spec.source.config).toBeUndefined();
    expect(spec.spec.sink.config).toEqual({ a: 1 });
  });

  it('throws when source or sink is missing', () => {
    const sourceOnly = [makeNode({ nodeType: 'source' }, 0)];
    expect(() => buildSpec(sourceOnly, { name: 'd', tenantId: 't' })).toThrow();
  });
});

// ── fromSpec (round-trip) ────────────────────────────────

describe('fromSpec', () => {
  it('round-trips through buildSpec preserving topology', () => {
    const original: PipelineSpec = {
      apiVersion: 'planx.io/v4',
      kind: 'Pipeline',
      metadata: { name: 'rt', tenantId: 't1' },
      spec: {
        source: { name: 'src', plugin: 'source-hello' },
        processors: [
          { name: 'p1', plugin: 'proc-a' },
          { name: 'p2', plugin: 'proc-b', config: { x: true } },
        ],
        sink: { name: 'snk', plugin: 'sink-stdout' },
      },
    };

    const nodes = fromSpec(original);
    // 1 source + 2 processors + 1 sink
    expect(nodes).toHaveLength(4);
    expect(nodes.filter((n) => n.data.nodeType === 'processor')).toHaveLength(2);

    const rebuilt = buildSpec(nodes, { name: 'rt', tenantId: 't1' });
    expect(rebuilt.spec.source).toEqual(original.spec.source);
    expect(rebuilt.spec.processors).toEqual(original.spec.processors);
    expect(rebuilt.spec.sink).toEqual(original.spec.sink);
  });
});

// ── validateSpec ─────────────────────────────────────────

describe('validateSpec', () => {
  const validSpec = (): PipelineSpec => ({
    apiVersion: 'planx.io/v4',
    kind: 'Pipeline',
    metadata: { name: 'demo', tenantId: 't1' },
    spec: {
      source: { name: 'src', plugin: 'source-hello' },
      sink: { name: 'snk', plugin: 'sink-stdout' },
    },
  });

  it('passes a valid minimal spec', () => {
    expect(validateSpec(validSpec()).valid).toBe(true);
  });

  it('flags missing pipeline name', () => {
    const s = validSpec();
    s.metadata.name = '';
    const r = validateSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Pipeline name'))).toBe(true);
  });

  it('flags missing tenant id', () => {
    const s = validSpec();
    s.metadata.tenantId = '  ';
    const r = validateSpec(s);
    expect(r.errors.some((e) => e.includes('Tenant ID'))).toBe(true);
  });

  it('flags missing source plugin', () => {
    const s = validSpec();
    s.spec.source.plugin = '';
    const r = validateSpec(s);
    expect(r.errors.some((e) => e.includes('Source node plugin'))).toBe(true);
  });

  it('flags duplicate node names', () => {
    const s = validSpec();
    s.spec.processors = [{ name: 'src', plugin: 'p' }]; // clashes with source name
    const r = validateSpec(s);
    expect(r.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('returns ALL errors, not just the first', () => {
    const s = validSpec();
    s.metadata.name = '';
    s.metadata.tenantId = '';
    s.spec.source.plugin = '';
    const r = validateSpec(s);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ── computeEdges (linearity guarantee) ───────────────────

describe('computeEdges', () => {
  it('produces a single linear chain (n-1 edges for n nodes)', () => {
    const nodes = [
      makeNode({ nodeType: 'source' }, 0),
      makeNode({ nodeType: 'processor' }, 1),
      makeNode({ nodeType: 'processor' }, 2),
      makeNode({ nodeType: 'sink' }, 3),
    ];
    const edges = computeEdges(nodes);
    expect(edges).toHaveLength(3); // never branches, never merges
    // each edge's target is the next node's source
    expect(edges[0].source).toBe(nodes[0].id);
    expect(edges[0].target).toBe(nodes[1].id);
    expect(edges[2].target).toBe(nodes[3].id);
  });

  it('produces zero edges for a single node', () => {
    const edges = computeEdges([makeNode({ nodeType: 'source' }, 0)]);
    expect(edges).toHaveLength(0);
  });

  it('respects _order, not array order', () => {
    const a = makeNode({ nodeType: 'source' }, 0);
    const b = makeNode({ nodeType: 'sink' }, 1);
    const edges = computeEdges([b, a]); // deliberately reversed in array
    expect(edges[0].source).toBe(a.id);
    expect(edges[0].target).toBe(b.id);
  });
});

// ── computeLayout ────────────────────────────────────────

describe('computeLayout', () => {
  it('stacks nodes vertically with increasing y', () => {
    const nodes = [
      makeNode({ nodeType: 'source' }, 0),
      makeNode({ nodeType: 'processor' }, 1),
      makeNode({ nodeType: 'sink' }, 2),
    ];
    const { nodes: laid } = computeLayout(nodes);
    const ys = laid.map((n) => n.position.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b)); // strictly ascending
    // all share the same x (centered column)
    const xs = laid.map((n) => n.position.x);
    expect(new Set(xs).size).toBe(1);
  });
});

// ── computeLinearOrder ───────────────────────────────────

describe('computeLinearOrder', () => {
  it('returns source first, sink last, processors between', () => {
    const nodes = [
      makeNode({ nodeType: 'sink' }, 3),
      makeNode({ nodeType: 'processor', name: 'p1' }, 1),
      makeNode({ nodeType: 'source' }, 0),
      makeNode({ nodeType: 'processor', name: 'p2' }, 2),
    ];
    const order = computeLinearOrder(nodes);
    expect(order).toHaveLength(4);
    expect(nodes.find((n) => n.id === order[0])?.data.nodeType).toBe('source');
    expect(nodes.find((n) => n.id === order[3])?.data.nodeType).toBe('sink');
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

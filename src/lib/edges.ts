import type { Edge } from '@xyflow/react';
import type { PipelineNode } from '@/types/node';

/**
 * Derive React Flow edges from the linear node order.
 * Edges are NEVER user-authorable — they always mirror the canonical
 * node order. This prevents DAG/branching invalid states.
 *
 * Linear chain: source → proc-1 → proc-2 → ... → sink
 */
export function computeEdges(nodes: PipelineNode[]): Edge[] {
  const sorted = [...nodes].sort((a, b) => a.data._order - b.data._order);
  const edges: Edge[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    edges.push({
      id: `e-${sorted[i].id}-${sorted[i + 1].id}`,
      source: sorted[i].id,
      target: sorted[i + 1].id,
      type: 'pipelineEdge',
      animated: true,
      style: { stroke: '#475569', strokeWidth: 2 },
    });
  }

  return edges;
}

// ── Auto-layout ──────────────────────────────────────────

const NODE_HEIGHT = 96;
const V_SPACING = 64;
const CANVAS_CENTER = 440;
const NODE_WIDTH = 260;

/**
 * Compute vertical positions for all nodes.
 * Source at top, processors in order, sink at bottom — all centered.
 */
export function computeLayout(
  nodes: PipelineNode[],
): { nodes: PipelineNode[] } {
  const sorted = [...nodes].sort((a, b) => a.data._order - b.data._order);

  const positioned = sorted.map((node, idx) => ({
    ...node,
    position: {
      x: CANVAS_CENTER - NODE_WIDTH / 2,
      y: 40 + idx * (NODE_HEIGHT + V_SPACING),
    },
  }));

  return { nodes: positioned };
}

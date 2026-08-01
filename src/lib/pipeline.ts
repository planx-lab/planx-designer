import type { PipelineSpec, NodeSpec, EdgeSpec } from '@/types/pipeline';
import { API_VERSION } from '@/types/pipeline';
import type { PipelineNode } from '@/types/node';
import type { Edge } from '@xyflow/react';
import type { ComponentKind } from '@/types/plugin';
import { validateSpec } from './validation';

/** Build a DAG PipelineSpec from React Flow nodes + edges. */
export function buildSpec(
  nodes: PipelineNode[],
  edges: Edge[],
  metadata: { name: string; tenantId: string },
): PipelineSpec {
  // ReactFlow node.id is an internal UUID; the spec id is the user-facing node
  // name (dag-designer.md §4.3: src-1/proc-1/snk-1). Edges reference nodes by UUID
  // internally, so map UUID → name to keep edge from/to consistent with node ids.
  const nameById = new Map<string, string>(nodes.map((n) => [n.id, n.data.name]));

  const nodeSpecs: NodeSpec[] = nodes.map((n) => {
    const spec: NodeSpec = { id: n.data.name, kind: n.data.nodeType, plugin_id: n.data.pluginId, component_id: n.data.componentId };
    if (n.data.config && Object.keys(n.data.config).length > 0) spec.config = n.data.config;
    return spec;
  });
  // Defensive: drop edges whose source/target isn't a known node. Without this,
  // a stale/dangling edge (e.g. from a corrupted persisted draft) would emit a
  // spec that fails engine validation with "node X not found". The map lookup
  // returns undefined for unknown ids → filter those out so submit never sends
  // a corrupted graph. (Layer 3 of the canvas-state-invariants fix.)
  const edgeSpecs: EdgeSpec[] = edges
    .map((e) => ({ from: nameById.get(e.source), to: nameById.get(e.target) }))
    .filter((e): e is EdgeSpec => e.from !== undefined && e.to !== undefined);
  return {
    apiVersion: API_VERSION,
    kind: 'Pipeline',
    metadata: { ...metadata },
    spec: { nodes: nodeSpecs, edges: edgeSpecs },
  };
}

/** Reconstruct React Flow nodes + edges from a DAG PipelineSpec. */
export function fromSpec(spec: PipelineSpec): { nodes: PipelineNode[]; edges: Edge[] } {
  // Layout nodes in a vertical column (source at top, processors, sink at bottom)
  // so a loaded pipeline is immediately readable instead of stacked at {0,0}.
  // A simple deterministic layout; the user can drag to refine.
  const kindOrder: Record<string, number> = { source: 0, processor: 1, sink: 2 };
  const indexed = spec.spec.nodes.map((ns, i) => ({ ns, i }));
  indexed.sort((a, b) => (kindOrder[a.ns.kind] ?? 3) - (kindOrder[b.ns.kind] ?? 3));

  const nodes: PipelineNode[] = spec.spec.nodes.map((ns) => ({
    id: ns.id,
    type: 'pipelineNode',
    position: { x: 250, y: 60 + (indexed.findIndex((n) => n.ns.id === ns.id)) * 120 },
    data: {
      name: ns.id,
      pluginId: ns.plugin_id,
      componentId: ns.component_id,
      pluginLabel: ns.plugin_id,
      config: ns.config ?? {},
      nodeType: ns.kind as ComponentKind,
      isValid: true,
    },
  }));
  const edges: Edge[] = spec.spec.edges.map((e, i) => ({
    id: `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
  }));
  return { nodes, edges };
}

export { validateSpec };

// ── Helpers ──────────────────────────────────────────────

export function isObjectEmpty(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length === 0;
}

export function generateNodeName(
  nodeType: ComponentKind,
  existingNames: string[],
): string {
  const prefix =
    nodeType === 'source' ? 'src' : nodeType === 'sink' ? 'snk' : 'proc';
  let i = 1;
  let candidate = `${prefix}-${i}`;
  while (existingNames.includes(candidate)) {
    i++;
    candidate = `${prefix}-${i}`;
  }
  return candidate;
}

import type { PipelineSpec, NodeSpec, EdgeSpec } from '@/types/pipeline';
import type { PipelineNode } from '@/types/node';
import type { Edge } from '@xyflow/react';
import type { PluginType } from '@/types/plugin';
import { validateSpec } from './validation';

/** Build a DAG PipelineSpec from React Flow nodes + edges. */
export function buildSpec(
  nodes: PipelineNode[],
  edges: Edge[],
  metadata: { name: string; tenantId: string },
): PipelineSpec {
  const nodeSpecs: NodeSpec[] = nodes.map((n) => {
    const spec: NodeSpec = { id: n.id, kind: n.data.nodeType as PluginType, plugin: n.data.plugin };
    if (n.data.config && Object.keys(n.data.config).length > 0) spec.config = n.data.config;
    return spec;
  });
  const edgeSpecs: EdgeSpec[] = edges.map((e) => ({ from: e.source, to: e.target }));
  return {
    apiVersion: 'planx.io/v4',
    kind: 'Pipeline',
    metadata: { ...metadata },
    spec: { nodes: nodeSpecs, edges: edgeSpecs },
  };
}

/** Reconstruct React Flow nodes + edges from a DAG PipelineSpec. */
export function fromSpec(spec: PipelineSpec): { nodes: PipelineNode[]; edges: Edge[] } {
  const nodes: PipelineNode[] = spec.spec.nodes.map((ns) => ({
    id: ns.id,
    type: 'pipelineNode',
    position: { x: 0, y: 0 },
    data: {
      name: ns.id,
      plugin: ns.plugin,
      pluginLabel: ns.plugin,
      config: ns.config ?? {},
      nodeType: ns.kind as PluginType,
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
  nodeType: PluginType,
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

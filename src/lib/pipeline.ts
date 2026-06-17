import type { PipelineSpec, NodeSpec, ValidationResult } from '@/types/pipeline';
import type { PipelineNode, PipelineNodeData } from '@/types/node';
import type { PluginType } from '@/types/plugin';

// ── Spec building ────────────────────────────────────────

/**
 * Build a PipelineSpec v4 from internal React Flow nodes.
 * The node order (_order field) determines the linear chain.
 */
export function buildSpec(
  nodes: PipelineNode[],
  metadata: { name: string; tenantId: string },
): PipelineSpec {
  const ordered = [...nodes].sort((a, b) => a.data._order - b.data._order);

  const sourceNode = ordered.find((n) => n.data.nodeType === 'source');
  const sinkNode = ordered.find((n) => n.data.nodeType === 'sink');
  const processorNodes = ordered.filter(
    (n) => n.data.nodeType === 'processor',
  );

  if (!sourceNode || !sinkNode) {
    throw new Error('Pipeline must have exactly one source and one sink');
  }

  const toSpec = (data: PipelineNodeData): NodeSpec => {
    const spec: NodeSpec = { name: data.name, plugin: data.plugin };
    if (data.config && Object.keys(data.config).length > 0) {
      spec.config = data.config;
    }
    return spec;
  };

  return {
    apiVersion: 'planx.io/v4',
    kind: 'Pipeline',
    metadata: { ...metadata },
    spec: {
      source: toSpec(sourceNode.data),
      processors:
        processorNodes.length > 0
          ? processorNodes.map((n) => toSpec(n.data))
          : undefined,
      sink: toSpec(sinkNode.data),
    },
  };
}

/**
 * Reconstruct internal React Flow nodes from an existing PipelineSpec v4.
 * Used for loading/editing existing pipelines.
 */
export function fromSpec(spec: PipelineSpec): PipelineNode[] {
  let order = 0;

  const makeNode = (
    name: string,
    plugin: string,
    nodeType: PluginType,
    config?: Record<string, unknown>,
  ): PipelineNode => ({
    id: crypto.randomUUID(),
    type: 'pipelineNode',
    position: { x: 0, y: 0 },
    data: {
      name,
      plugin,
      pluginLabel: plugin,
      config: config ?? {},
      nodeType,
      isValid: true,
      _order: order++,
    },
  });

  const nodes: PipelineNode[] = [
    makeNode(spec.spec.source.name, spec.spec.source.plugin, 'source', spec.spec.source.config),
  ];

  if (spec.spec.processors) {
    for (const proc of spec.spec.processors) {
      nodes.push(makeNode(proc.name, proc.plugin, 'processor', proc.config));
    }
  }

  nodes.push(makeNode(spec.spec.sink.name, spec.spec.sink.plugin, 'sink', spec.spec.sink.config));
  return nodes;
}

// ── Validation ───────────────────────────────────────────

/**
 * Validate a PipelineSpec before submission.
 * Returns all errors (does not short-circuit) so the user sees
 * everything that needs fixing in one pass.
 */
export function validateSpec(spec: PipelineSpec): ValidationResult {
  const errors: string[] = [];

  // Metadata
  if (!spec.metadata.name?.trim()) {
    errors.push('Pipeline name is required.');
  }
  if (!spec.metadata.tenantId?.trim()) {
    errors.push('Tenant ID is required.');
  }

  // Source
  if (!spec.spec.source) {
    errors.push('A source node is required.');
  } else {
    if (!spec.spec.source.name?.trim())
      errors.push('Source node name is required.');
    if (!spec.spec.source.plugin?.trim())
      errors.push('Source node plugin is required.');
  }

  // Processors
  const procCount = spec.spec.processors?.length ?? 0;
  if (procCount > 50) {
    errors.push(`Too many processors (${procCount}). Maximum is 50.`);
  }
  if (spec.spec.processors) {
    for (let i = 0; i < spec.spec.processors.length; i++) {
      const p = spec.spec.processors[i];
      if (!p.name?.trim())
        errors.push(`Processor #${i + 1} name is required.`);
      if (!p.plugin?.trim())
        errors.push(`Processor "${p.name || `#${i + 1}`}" plugin is required.`);
    }
  }

  // Sink
  if (!spec.spec.sink) {
    errors.push('A sink node is required.');
  } else {
    if (!spec.spec.sink.name?.trim())
      errors.push('Sink node name is required.');
    if (!spec.spec.sink.plugin?.trim())
      errors.push('Sink node plugin is required.');
  }

  // Name uniqueness
  const allNames = [
    spec.spec.source,
    ...(spec.spec.processors ?? []),
    spec.spec.sink,
  ]
    .filter(Boolean)
    .map((n) => n.name);
  const dupes = allNames.filter((n, i) => allNames.indexOf(n) !== i);
  for (const d of [...new Set(dupes)]) {
    errors.push(`Duplicate node name: "${d}".`);
  }

  return { valid: errors.length === 0, errors };
}

// ── Linear order ─────────────────────────────────────────

/**
 * Compute the sorted linear order of node IDs.
 * Order: [source, ...processors (by _order), sink].
 */
export function computeLinearOrder(nodes: PipelineNode[]): string[] {
  const source = nodes.find((n) => n.data.nodeType === 'source');
  const sink = nodes.find((n) => n.data.nodeType === 'sink');
  const processors = nodes
    .filter((n) => n.data.nodeType === 'processor')
    .sort((a, b) => a.data._order - b.data._order);

  return [
    ...(source ? [source.id] : []),
    ...processors.map((n) => n.id),
    ...(sink ? [sink.id] : []),
  ];
}

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

import type { Edge } from '@xyflow/react';
import type { PipelineSpec } from '@/types/pipeline';
import { buildSpec } from './pipeline';
import type { PipelineNode } from '@/types/node';

/**
 * Serialize internal nodes + edges to a YAML string.
 * Uses a basic serializer to avoid the ~45 kB js-yaml dependency
 * for the simple flat structures PipelineSpec uses.
 */
export function toYaml(
  nodes: PipelineNode[],
  edges: Edge[],
  metadata: { name: string; tenantId: string },
): string {
  const spec = buildSpec(nodes, edges, metadata);
  return serializeSpec(spec);
}

function serializeSpec(spec: PipelineSpec): string {
  const lines: string[] = [
    `apiVersion: ${spec.apiVersion}`,
    `kind: ${spec.kind}`,
    'metadata:',
    `  name: ${spec.metadata.name}`,
    `  tenantId: ${spec.metadata.tenantId}`,
    'spec:',
    '  nodes:',
  ];

  for (const node of spec.spec.nodes) {
    lines.push(`    - id: ${node.id}`);
    lines.push(`      kind: ${node.kind}`);
    lines.push(`      plugin: ${node.plugin}`);
    if (node.config && Object.keys(node.config).length > 0) {
      lines.push(`      config:`);
      lines.push(...indent(serializeConfig(node.config), 8));
    }
  }

  lines.push('  edges:');
  for (const edge of spec.spec.edges) {
    lines.push(`    - from: ${edge.from}`);
    lines.push(`      to: ${edge.to}`);
  }

  return lines.join('\n') + '\n';
}

function serializeConfig(config: Record<string, unknown>, depth = 0): string[] {
  const lines: string[] = [];
  const prefix = '  '.repeat(depth);
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      lines.push(
        ...serializeConfig(value as Record<string, unknown>, depth + 1),
      );
    } else if (Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      for (const item of value) {
        lines.push(`${prefix}  - ${JSON.stringify(item)}`);
      }
    } else {
      const str =
        typeof value === 'string' ? value : JSON.stringify(value);
      lines.push(`${prefix}${key}: ${str}`);
    }
  }
  return lines;
}

function indent(lines: string[], spaces: number): string[] {
  const pad = ' '.repeat(spaces);
  return lines.map((l) => pad + l);
}

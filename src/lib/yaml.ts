import type { Edge } from '@xyflow/react';
import { dump, JSON_SCHEMA, Type } from 'js-yaml';
import { isInteger, isLosslessNumber, isNumber } from 'lossless-json';
import { buildSpec } from './pipeline';
import { parseJsonNumber } from './json';
import type { PipelineNode } from '@/types/node';

// JSON-compatible YAML scalars: numeric lexemes stay exact, while strings
// (including typed decimals, dates and numeric identifiers) remain strings.
export const losslessYamlSchema = JSON_SCHEMA.extend({
  implicit: ['int', 'float'].map((kind) => new Type(`tag:yaml.org,2002:${kind}`, {
    kind: 'scalar',
    resolve: (value: string | null) => value !== null && isNumber(value) &&
      (kind === 'float' || isInteger(value)),
    construct: parseJsonNumber,
    predicate: (value: unknown) => {
      if (isLosslessNumber(value)) {
        return kind === 'int' ? isInteger(value.value) : !isInteger(value.value);
      }
      return typeof value === 'number' && Number.isFinite(value) &&
        (kind === 'int' ? Number.isInteger(value) : !Number.isInteger(value));
    },
    represent: (value: unknown) => isLosslessNumber(value)
      ? value.value
      : Object.is(value, -0) ? '-0' : String(value),
  })),
});

/** Serialize the same spec used by the API, without lossy numeric conversion. */
export function toYaml(
  nodes: PipelineNode[],
  edges: Edge[],
  metadata: { name: string; tenantId: string },
): string {
  return dump(buildSpec(nodes, edges, metadata), {
    schema: losslessYamlSchema,
    forceQuotes: true,
    quotingType: '"',
    noRefs: true,
    lineWidth: -1,
  });
}

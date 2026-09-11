import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';
import { parse, stringify } from 'lossless-json';
import { toYaml, losslessYamlSchema } from './yaml';
import type { PipelineSpec } from '@/types/pipeline';
import type { PipelineNode } from '@/types/node';

describe('lossless YAML roundtrip', () => {
  it('retains numeric literals and explicit strings through YAML decoding', () => {
    const raw = '{"int":9007199254740993,"decimal":123456789.012345678900,"tiny":1.2300e-500,"negativeZero":-0,"nested":[{"int":18446744073709551615}],"text":"9007199254740993","date":"2026-09-08","empty":[],"object":{},"null":null,"zero":0}';
    const nodes: PipelineNode[] = [{
      id: 'src', type: 'pipelineNode', position: { x: 0, y: 0 },
      data: {
        name: 'src', nodeType: 'source', pluginId: 'builtin', componentId: 'source',
        pluginLabel: 'Builtin', config: parse(raw) as Record<string, unknown>, isValid: true,
      },
    }];
    const yaml = toYaml(nodes, [], { name: '2026-09-08', tenantId: '001' });
    const restored = load(yaml, { schema: losslessYamlSchema }) as PipelineSpec;
    expect(stringify(restored.spec.nodes[0].config)).toBe(raw);
    expect(restored.metadata).toEqual({ name: '2026-09-08', tenantId: '001' });
    expect(restored.spec.edges).toEqual([]);
    expect(restored.spec.nodes[0].config).not.toHaveProperty('missing');
  });
});

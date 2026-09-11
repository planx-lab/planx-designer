import { afterEach, expect, it } from 'vitest';
import { load } from 'js-yaml';
import { parse, stringify } from 'lossless-json';
import { toYaml } from './yaml';
import { saveDraft, loadDraft, clearDraft } from './draft';
import { buildSpec, fromSpec } from './pipeline';
import type { PipelineNode } from '@/types/node';

const raw = '{"id":9007199254740993,"amount":123456789.123456789012345678900,"items":[1.2300e-500,null],"typedDecimal":"12.3400","typedInt":"18446744073709551615","date":"2026-09-08","localTime":"2026-09-08T12:00:00","zero":0,"empty":"","null":null}';
const metadata = { name: 'yes: exact', tenantId: '12345' };
function nodes(config: Record<string, unknown>): PipelineNode[] {
  return [{ id: 'src', type: 'pipelineNode', position: { x: 0, y: 0 }, data: {
    name: 'src', nodeType: 'source', pluginId: 'p', componentId: 'source', pluginLabel: 'Source', config, isValid: true,
  } }];
}
afterEach(clearDraft);

it('preserves exact values across spec reconstruction and persisted drafts', () => {
  const spec = buildSpec(nodes(parse(raw) as Record<string, unknown>), [], metadata);
  const rebuilt = fromSpec(spec);
  saveDraft({ ...metadata, ...rebuilt });
  const draft = loadDraft()!;
  expect(stringify(draft.nodes[0].data.config)).toBe(raw);
  expect(stringify(buildSpec(draft.nodes, draft.edges, metadata).spec.nodes[0].config)).toBe(raw);
});

it('emits exact numeric YAML scalars and quotes explicit numeric/date/empty strings', () => {
  const yaml = toYaml(nodes(parse(raw) as Record<string, unknown>), [], metadata);
  expect(yaml).toContain('id: 9007199254740993');
  expect(yaml).toContain('amount: 123456789.123456789012345678900');
  expect(yaml).toContain('1.2300e-500');
  expect(yaml).not.toContain('isLosslessNumber');
  const loaded = load(yaml) as ReturnType<typeof buildSpec>;
  expect(loaded.metadata).toEqual(metadata);
  const config = loaded.spec.nodes[0].config!;
  expect(config.typedDecimal).toBe('12.3400');
  expect(config.typedInt).toBe('18446744073709551615');
  expect(config.date).toBe('2026-09-08');
  expect(config.localTime).toBe('2026-09-08T12:00:00');
  expect(config.empty).toBe('');
  expect(config.null).toBeNull();
  expect(loaded.spec.edges).toEqual([]);
});

it('restores native React Flow layout numbers without coercing config numbers', () => {
  const position = { x: 1.25, y: -0.125 };
  const measured = { width: 100.25, height: 50.5 };
  const raw = '{"amount":123456789.012345678900,"id":9007199254740993}';
  saveDraft({ name: 'layout', tenantId: 'tenant-a', edges: [], nodes: [{
    id: 'src', type: 'pipelineNode', position, width: measured.width, height: measured.height, measured,
    data: {
      name: 'src', nodeType: 'source', pluginId: 'builtin', componentId: 'source',
      pluginLabel: 'Builtin', isValid: true, config: parse(raw) as Record<string, unknown>,
    },
  }] });
  const restored = loadDraft()!.nodes[0];
  expect(restored.position).toEqual(position);
  expect(restored.measured).toEqual(measured);
  expect(restored.width).toBe(measured.width);
  expect(restored.height).toBe(measured.height);
  expect(stringify(restored.data.config)).toBe(raw);
});

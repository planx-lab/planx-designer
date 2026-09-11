import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { load } from 'js-yaml';
import { SourcePreviewPanel } from './SourcePreviewPanel';
import { previewSource } from '@/api/pluginPreview';
import { checkCompatibility } from '@/api/pluginOperations';
import { parseJson, stringifyJson } from '@/lib/json';
import { buildSpec } from '@/lib/pipeline';
import { losslessYamlSchema, toYaml } from '@/lib/yaml';
import type { PipelineNode } from '@/types/node';
import type { RecordBatch, RecordSchema } from '@/types/record';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const schema: RecordSchema = {
  fields: [
    { name: 'unknown', kind: 'timestamp', nullable: true },
    { name: 'seconds', kind: 'timestamp', nullable: false, timePrecision: 0 },
    { name: 'micros', kind: 'datetime', nullable: false, timePrecision: 6 },
    { name: 'nanos', kind: 'timestamp', nullable: false, timePrecision: 9 },
    { name: 'amount', kind: 'decimal', nullable: true, precision: 38, scale: 18 },
    { name: 'nested', kind: 'struct', nullable: false, fields: [
      { name: 'civil', kind: 'datetime', nullable: false, timePrecision: 0 },
    ] },
    { name: 'instants', kind: 'list', nullable: false, element:
      { name: 'item', kind: 'timestamp', nullable: false, timePrecision: 9 } },
  ],
};

const batch: RecordBatch = {
  schema,
  records: [{
    unknown: { kind: 'timestamp', present: true, null: false, data: '2026-09-09T01:02:03.123456789Z' },
    seconds: { kind: 'timestamp', present: true, null: false, data: '2026-09-09T01:02:03Z' },
    micros: { kind: 'datetime', present: true, null: false, data: '2026-09-09T01:02:03.123456' },
    nanos: { kind: 'timestamp', present: true, null: false, data: '2026-09-09T01:02:03.123456789Z' },
    amount: { kind: 'decimal', present: true, null: false, data: {
      coefficient: '12345678901234567890123456789012345678', exponent: -18,
    } },
    nested: { kind: 'struct', present: true, null: false, data: {
      civil: { kind: 'datetime', present: true, null: false, data: '2026-09-09T01:02:03' },
    } },
    instants: { kind: 'list', present: true, null: false, data: [
      { kind: 'timestamp', present: true, null: false, data: '2026-09-09T01:02:03.000000001Z' },
    ] },
  }],
};

const config = {
  ...(parseJson('{"connection_ref":"source","table":"reference.source_records","large":9007199254740993,"decimal":123456789.012345678900}') as Record<string, unknown>),
  schema,
};

it('explains unknown versus zero temporal precision without changing typed schema or values', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stringifyJson({ batch, truncated: false }))));
  render(<SourcePreviewPanel tenantId="reference" pluginId="sqlserver" componentId="source"
    config={config} operations={{ testConnection: true, checkCompatibility: false, preview: true }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview source data', exact: true }));
  expect((await screen.findByLabelText('Preview record.Schema')).textContent).toBe(stringifyJson(schema, 2));
  expect(screen.getByLabelText('Typed preview records').textContent).toBe(stringifyJson(batch.records, 2));
  expect(screen.getByText('Temporal timePrecision (0-9) is reported metadata: omitted means unknown; 0 means whole seconds. Decimal precision/scale are separate. No precision is inferred and no time value is rounded.')).toBeInTheDocument();
});

it('passes actual preview timePrecision metadata to compatibility without inferring omitted precision', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(stringifyJson({ batch, truncated: false })))
    .mockResolvedValueOnce(new Response('{"compatible":false,"issues":[{"field":"unknown","code":"unknown_precision"}],"scope":"static_schema","runtimeValidationRequired":true}'));
  vi.stubGlobal('fetch', fetchMock);
  const preview = await previewSource('sqlserver', 'source', config, 'reference');
  const result = await checkCompatibility('postgres', 'sink', config, preview.batch.schema, 'reference');
  const request = fetchMock.mock.calls[1][1] as RequestInit;
  const sent = parseJson(request.body as string) as { inputSchema: RecordSchema };
  expect(sent.inputSchema).toEqual(schema);
  expect(sent.inputSchema.fields[0]).not.toHaveProperty('timePrecision');
  expect(sent.inputSchema.fields[1].timePrecision).toBe(0);
  expect(sent.inputSchema.fields[2].timePrecision).toBe(6);
  expect(sent.inputSchema.fields[3].timePrecision).toBe(9);
  expect(sent.inputSchema.fields[4]).not.toHaveProperty('timePrecision');
  expect(request.body).toContain('9007199254740993');
  expect(request.body).toContain('123456789.012345678900');
  expect(result).toEqual({ compatible: false, issues: [{ field: 'unknown', code: 'unknown_precision' }], scope: 'static_schema', runtimeValidationRequired: true });
});

it.each(['JSON', 'YAML'])('preserves temporal metadata, nanosecond text and exact numeric config through canonical %s', (format) => {
  const nodes: PipelineNode[] = [{ id: 'read', type: 'pipelineNode', position: { x: 0, y: 0 }, data: {
    nodeType: 'source', name: 'read', pluginId: 'sqlserver', componentId: 'source', pluginLabel: 'SQL Server', isValid: true,
    config: { ...config, sample: batch.records[0] },
  } }];
  const metadata = { name: 'temporal-roundtrip', tenantId: 'reference' };
  const expected = stringifyJson(buildSpec(nodes, [], metadata));
  const decoded = format === 'JSON'
    ? parseJson(expected)
    : load(toYaml(nodes, [], metadata), { schema: losslessYamlSchema });
  expect(stringifyJson(decoded)).toBe(expected);
  expect(expected).toContain('"timePrecision":0');
  expect(expected).toContain('"timePrecision":6');
  expect(expected).toContain('"timePrecision":9');
  expect(expected).toContain('2026-09-09T01:02:03.123456789Z');
  expect(expected).toContain('9007199254740993');
  expect(expected).toContain('123456789.012345678900');
});

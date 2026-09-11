import { afterEach, expect, it, vi } from 'vitest';
import { getPlugins } from './controlPlane';
import { checkCompatibility, testConnection } from './pluginOperations';
import { parseJson } from '@/lib/json';
import { ApiError } from '@/types/api';

afterEach(() => vi.unstubAllGlobals());

const inputSchema = { fields: [
  { name: 'record_id', kind: 'int64' as const, nullable: false, precision: 0, scale: 0 },
  { name: 'amount', kind: 'decimal' as const, nullable: true, precision: 38, scale: 18 },
] };

it('preserves only server-advertised operation capabilities, including false and absent values', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ plugins: [{
    id: 'sqlserver', version: '1', displayName: 'SQL Server', components: [
      { id: 'source', kind: 'source', displayName: 'Source', operations: { testConnection: true, checkCompatibility: false } },
      { id: 'sink', kind: 'sink', displayName: 'Sink', operations: { testConnection: false, checkCompatibility: true } },
      { id: 'legacy', kind: 'processor', displayName: 'Legacy' },
    ],
  }] }))));
  const [plugin] = await getPlugins();
  expect(plugin.components.map((component) => component.operations)).toEqual([
    { testConnection: true, checkCompatibility: false },
    { testConnection: false, checkCompatibility: true },
    undefined,
  ]);
});

it('posts an explicit tenant-scoped connection probe with exact config and no inputSchema', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"connected":true}'));
  vi.stubGlobal('fetch', fetch);
  const config = parseJson('{"connection_ref":"source","id":9007199254740993,"amount":123456789.012345678900}') as Record<string, unknown>;
  expect(await testConnection('sqlserver', 'source', config, 'reference')).toEqual({ connected: true });
  expect(fetch.mock.calls[0][0]).toMatch(/\/plugins\/test-connection$/);
  expect(fetch.mock.calls[0][1].method).toBe('POST');
  const body = fetch.mock.calls[0][1].body;
  expect(body).toContain('"id":9007199254740993');
  expect(body).toContain('"amount":123456789.012345678900');
  expect(parseJson(body)).toEqual({ tenantId: 'reference', pluginId: 'sqlserver', componentId: 'source', config });
});

it('posts one post-processor record.Schema and preserves static-scope result fields', async () => {
  const result = { compatible: false, issues: [{ field: 'amount', code: 'decimal_precision_narrowing' }], scope: 'static_schema', runtimeValidationRequired: true };
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
  vi.stubGlobal('fetch', fetch);
  expect(await checkCompatibility('postgres', 'sink', { connection_ref: 'target' }, inputSchema, 'reference')).toEqual(result);
  expect(fetch.mock.calls[0][0]).toMatch(/\/plugins\/check-compatibility$/);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    tenantId: 'reference', pluginId: 'postgres', componentId: 'sink', config: { connection_ref: 'target' }, inputSchema,
  });
});

it('rejects missing tenant context before either active request', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(testConnection('sqlserver', 'source', {}, '')).rejects.toThrow(/tenant context/i);
  await expect(checkCompatibility('postgres', 'sink', {}, inputSchema, ' ')).rejects.toThrow(/tenant context/i);
  expect(fetch).not.toHaveBeenCalled();
});

it('retains structured unsupported status rather than converting HTTP 501 into success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(
    '{"error":"Component does not support this operation","code":"unsupported"}', { status: 501 },
  ))));
  await expect(testConnection('external', 'source', {}, 'reference')).rejects.toMatchObject({ status: 501 });
  await expect(checkCompatibility('external', 'sink', {}, inputSchema, 'reference')).rejects.toBeInstanceOf(ApiError);
});

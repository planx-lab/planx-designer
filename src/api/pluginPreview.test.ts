import { afterEach, expect, it, vi } from 'vitest';
import { previewSource } from './pluginPreview';
import { parseJson, stringifyJson } from '@/lib/json';
import { ApiError } from '@/types/api';

afterEach(() => vi.unstubAllGlobals());

const response = '{"batch":{"schema":{"fields":[{"name":"id","kind":"int64","nullable":false},{"name":"amount","kind":"decimal","nullable":true,"precision":38,"scale":18}]},"records":[{"id":{"kind":"int64","present":true,"null":false,"data":"9007199254740993"},"amount":{"kind":"decimal","present":true,"null":false,"data":{"coefficient":"12345678901234567890123456789012345678","exponent":-18}}}]},"truncated":true}';

it('sends one explicit tenant-scoped preview with exact config, limits and cancellation', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(response));
  vi.stubGlobal('fetch', fetch);
  const controller = new AbortController();
  const config = parseJson('{"connection_ref":"source","batch_rows":3,"large":9007199254740993,"decimal":123456789.012345678900}') as Record<string, unknown>;
  const result = await previewSource('sqlserver', 'source', config, 'reference', { maxRows: 20, maxBytes: 65536 }, controller.signal);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('/api/plugins/preview');
  const init = fetch.mock.calls[0][1];
  expect(init.method).toBe('POST');
  expect(init.signal).toBe(controller.signal);
  expect(init.body).toContain('"large":9007199254740993');
  expect(init.body).toContain('"decimal":123456789.012345678900');
  expect(parseJson(init.body)).toMatchObject({ tenantId: 'reference', pluginId: 'sqlserver', componentId: 'source', maxRows: 20, maxBytes: 65536 });
  expect(init.body).not.toContain('inputSchema');
  expect(stringifyJson(result)).toBe(response);
});

it('leaves omitted limits to the server defaults and does not invent pagination', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(response));
  vi.stubGlobal('fetch', fetch);
  await previewSource('sqlserver', 'source', { connection_ref: 'source' }, 'reference');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    tenantId: 'reference', pluginId: 'sqlserver', componentId: 'source', config: { connection_ref: 'source' },
  });
});

it('accepts the contract zero values as server-default limits', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(response));
  vi.stubGlobal('fetch', fetch);
  await previewSource('sqlserver', 'source', {}, 'reference', { maxRows: 0, maxBytes: 0 });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ maxRows: 0, maxBytes: 0 });
});

it('rejects missing tenant context before any request', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(previewSource('sqlserver', 'source', {}, ' ')).rejects.toThrow(/Tenant/);
  expect(fetch).not.toHaveBeenCalled();
});

it.each([{ maxRows: 101 }, { maxRows: -1 }, { maxRows: 1.5 }, { maxBytes: 1048577 }])(
  'rejects unsupported budgets before any request: %j', async (limits) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(previewSource('sqlserver', 'source', {}, 'reference', limits)).rejects.toThrow(/Preview limits/);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it('preserves unsupported HTTP status instead of converting it to an empty preview', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"unsupported","code":"unsupported"}', { status: 501 })));
  await expect(previewSource('external', 'source', {}, 'reference')).rejects.toMatchObject({ status: 501, name: 'ApiError' } satisfies Partial<ApiError>);
});

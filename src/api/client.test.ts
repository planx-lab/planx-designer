import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { discoverSchema, getPipelineSpec, submitPipeline, updatePipeline } from './controlPlane';
import { API_VERSION } from '@/types/pipeline';

const config = '{"id":9007199254740993,"signed":-9223372036854775808,"unsigned":18446744073709551615,"decimal":1234567890.123456789012345678900,"small":1.2300e-500,"negativeZero":-0,"count":7,"nested":[{"amount":0.1000}],"text":"9007199254740993","date":"2026-09-08","null":null}';

afterEach(() => vi.unstubAllGlobals());

describe('lossless HTTP serialization', () => {
  it.each(['post', 'put'] as const)('retains numeric literals through response parsing and %s', async (method) => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(config)));
    vi.stubGlobal('fetch', fetch);
    const value = await api.get<Record<string, unknown>>('/example');
    await api[method]('/example', value);
    expect(fetch.mock.calls[1][1].body).toBe(config);
    expect(value.count).toBe(7);
    expect(value.text).toBe('9007199254740993');
    expect(value.date).toBe('2026-09-08');
    expect(value.null).toBeNull();
    expect(value).not.toHaveProperty('missing');
  });

  it('preserves config when loading, saving and creating a draft', async () => {
    const specification = `{"apiVersion":"${API_VERSION}","kind":"Pipeline","metadata":{"name":"exact","tenantId":"t"},"spec":{"nodes":[{"id":"src","kind":"source","plugin_id":"p","component_id":"source","config":${config}}],"edges":[]}}`;
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(`{"pipelineId":"p1","revision":"r1","tenantId":"t","specification":${specification}}`))
      .mockResolvedValueOnce(new Response('{"status":"ok","pipelineWorkflow":"draft-v1","connectionWorkflow":"managed-v1"}'))
      .mockResolvedValueOnce(new Response(`{"pipelineId":"p1","revision":"r2","tenantId":"t","specification":${specification}}`))
      .mockResolvedValueOnce(new Response('{"status":"ok","pipelineWorkflow":"draft-v1","connectionWorkflow":"managed-v1"}'))
      .mockResolvedValueOnce(new Response(`{"pipelineId":"p2","revision":"r1","tenantId":"t","specification":${specification}}`));
    vi.stubGlobal('fetch', fetch);
    const detail = await getPipelineSpec('p1', 't');
    await updatePipeline('p1', 't', 'exact', detail.specification, detail.revision);
    const saved = await submitPipeline(detail.specification, 't');
    expect(fetch.mock.calls[2][1].body).toContain(`"config":${config}`);
    expect(fetch.mock.calls[4][1].body).toContain(`"config":${config}`);
    expect(fetch.mock.calls[2][1].body).toContain('"expectedRevision":"r1"');
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(saved).not.toHaveProperty('executionId');
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/run'))).toBe(false);
  });

  it('retains the no-content response behavior', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.del('/example')).resolves.toBeUndefined();
  });
});

describe('discovery tenant context', () => {
  it('includes the explicit tenant in the discovery body', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"tables":[],"columns":[]}'));
    vi.stubGlobal('fetch', fetch);
    await discoverSchema('postgres', 'source', { host: 'db' }, 'tenant-a');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      tenantId: 'tenant-a', pluginId: 'postgres', componentId: 'source', config: { host: 'db' },
    });
  });

  it.each(['', '   '])('rejects missing tenant context before issuing a request (%j)', async (tenant) => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"tables":[],"columns":[]}'));
    vi.stubGlobal('fetch', fetch);
    await expect(discoverSchema('postgres', 'source', {}, tenant)).rejects.toThrow(/tenant/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});

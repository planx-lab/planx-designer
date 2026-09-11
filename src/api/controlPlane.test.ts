import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineSpec } from '@/types/pipeline';
import { discoverSchema, normalizeStatus, validateConfig, runPipeline, submitPipeline, updatePipeline, getExecutionByRequest } from './controlPlane';

describe('validateConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls POST /plugins/validate and returns { ok, message }', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ ok: true, message: 'Config is valid' })),
    });

    const result = await validateConfig('plugin-1', 'comp-1', {
      host: 'localhost',
    }, 'tenant-a');
    expect(result).toEqual({ ok: true, message: 'Config is valid' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/validate'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('plugin-1'),
      }),
    );
  });

  it('returns { ok: false, message } on validation failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
          ok: false,
          message: 'Missing required field: host',
        })),
    });

    const result = await validateConfig('plugin-1', 'comp-1', {}, 'tenant-a');
    expect(result).toEqual({
      ok: false,
      message: 'Missing required field: host',
    });
  });
});

// The engine returns UPPERCASE pipeline-level status (model.ExecutionStatus:
// PENDING/RUNNING/SUCCEEDED/FAILED), but the Designer contract is lowercase
// (matches node-level NodeStatus in dag_run.go + alpha spec success criteria #4).
// normalizeStatus bridges that at the API boundary.

describe('normalizeStatus', () => {
  it('lowercases engine UPPERCASE pipeline status', () => {
    expect(normalizeStatus({ status: 'PENDING' }).status).toBe('pending');
    expect(normalizeStatus({ status: 'RUNNING' }).status).toBe('running');
    expect(normalizeStatus({ status: 'SUCCEEDED' }).status).toBe('succeeded');
    expect(normalizeStatus({ status: 'FAILED' }).status).toBe('failed');
  });

  it('is idempotent on already-lowercase status', () => {
    expect(normalizeStatus({ status: 'running' }).status).toBe('running');
  });

  it('preserves sibling fields', () => {
    const r = normalizeStatus({ executionId: 'e1', pipelineId: 'p1', status: 'RUNNING' });
    expect(r).toMatchObject({ executionId: 'e1', pipelineId: 'p1', status: 'running' });
  });

  it('does not touch nested nodeStatuses (already lowercase)', () => {
    const r = normalizeStatus({
      status: 'RUNNING',
      nodeStatuses: { 'src-1': { nodeId: 'src-1', status: 'running' } },
    });
    expect(r.nodeStatuses['src-1'].status).toBe('running');
  });
});

describe('discoverSchema', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls POST /plugins/discover-schema and returns tables', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
          tables: [
            { schema: 'public', name: 'users' },
            { schema: 'public', name: 'orders' },
          ],
          columns: [],
        })),
    });

    const result = await discoverSchema('postgres', 'source', {
      host: 'localhost',
      port: 5432,
    }, 'tenant-a');

    expect(result.tables).toEqual([
      { schema: 'public', name: 'users' },
      { schema: 'public', name: 'orders' },
    ]);
    expect(result.columns).toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/discover-schema'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('postgres'),
      }),
    );
  });

  it('returns columns when config includes a table', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
          tables: [],
          columns: [
            { name: 'id', type: 'integer', nullable: false },
            { name: 'email', type: 'text', nullable: true },
          ],
        })),
    });

    const result = await discoverSchema('postgres', 'source', {
      host: 'localhost',
      table: 'public.users',
    }, 'tenant-a');

    expect(result.columns).toEqual([
      { name: 'id', type: 'integer', nullable: false },
      { name: 'email', type: 'text', nullable: true },
    ]);
    expect(result.tables).toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/discover-schema'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('public.users'),
      }),
    );
  });
});

// Saving and running are different operations, guarded against an old Engine.
const draft: PipelineSpec = { apiVersion: 'planx/v4', kind: 'Pipeline', metadata: { name: 'draft', tenantId: 'acme' }, spec: { nodes: [], edges: [] } };
const response = (value: unknown) => ({ ok: true, text: () => Promise.resolve(JSON.stringify(value)) });
const health = () => response({ status: 'ok', pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v1' });

describe('saved draft workflow', () => {
  it('POSTs a confirmed revision and request ID to the existing run resource', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(health()).mockResolvedValueOnce(response({ executionId: 'exec-9', pipelineId: 'pipe-7', status: 'RUNNING' }));
    global.fetch = fetch;
    const result = await runPipeline('pipe-7', 'acme', 'revision-1', 'intent-1', { warehouse: 'runtime-1' });
    expect(result).toEqual({ executionId: 'exec-9', pipelineId: 'pipe-7', status: 'running' });
    const [url, init] = fetch.mock.calls[1];
    expect(fetch.mock.calls[0][0]).toContain('/healthz');
    expect(url).toContain('/pipelines/pipe-7/run?tenantId=acme');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ expectedRevision: 'revision-1', requestId: 'intent-1', expectedConnections: { warehouse: 'runtime-1' } });
  });

  it('saves incomplete drafts without requesting an execution', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(health()).mockResolvedValueOnce(response({ pipelineId: 'p1', revision: 'r1', tenantId: 'acme', specification: draft }));
    global.fetch = fetch;
    const saved = await submitPipeline(draft, 'acme');
    expect(saved.revision).toBe('r1');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toMatch(/\/pipelines$/);
    expect(JSON.parse(fetch.mock.calls[1][1].body).specification).toEqual(draft);
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/run'))).toBe(false);
  });

  it.each(['save', 'update', 'run'])('refuses %s against a create-and-run Engine without a mutation', async (action) => {
    const fetch = vi.fn().mockResolvedValue(response({ status: 'ok' }));
    global.fetch = fetch;
    const operation = action === 'save' ? submitPipeline(draft, 'acme')
      : action === 'update' ? updatePipeline('p1', 'acme', 'draft', draft, 'r1')
      : runPipeline('p1', 'acme', 'r1', 'request-1', {});
    await expect(operation).rejects.toMatchObject({ status: 412 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });

  it.each([
    { name: 'draft-only', features: { pipelineWorkflow: 'draft-v1' } },
    { name: 'managed-only', features: { connectionWorkflow: 'managed-v1' } },
    { name: 'incompatible managed version', features: { pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v0' } },
    { name: 'incompatible draft version', features: { pipelineWorkflow: 'draft-v0', connectionWorkflow: 'managed-v1' } },
  ])('blocks save, update and run on $name health before mutation', async ({ features }) => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response({ status: 'ok', ...features })));
    global.fetch = fetch;
    for (const operation of [
      () => submitPipeline(draft, 'acme'),
      () => updatePipeline('p1', 'acme', 'draft', draft, 'editor-base'),
      () => runPipeline('p1', 'acme', 'r1', 'original-request', { warehouse: 'runtime-confirmed' }),
    ]) {
      fetch.mockClear();
      await expect(operation()).rejects.toMatchObject({ status: 412 });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][0]).toContain('/healthz');
      expect(fetch.mock.calls[0][1].method).toBeUndefined();
    }
  });

  it('passes the editor base revision on update, not a freshly fetched revision', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(health()).mockResolvedValueOnce(response({ pipelineId: 'p1', revision: 'r2', specification: draft }));
    global.fetch = fetch;
    await updatePipeline('p1', 'acme', 'draft', draft, 'editor-base');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].method).toBe('PUT');
    expect(JSON.parse(fetch.mock.calls[1][1].body).expectedRevision).toBe('editor-base');
  });

  it('queries the original request without any POST or replay', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ id: 'original', pipelineId: 'p1', status: 'FAILED', definition: { revision: 'r1' } }));
    global.fetch = fetch;
    const outcome = await getExecutionByRequest('request/id', 'a b');
    expect(outcome.executionId).toBe('original');
    expect(outcome.status).toBe('failed');
    expect(fetch.mock.calls[0][0]).toContain('/executions/by-request/request%2Fid?tenantId=a%20b');
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('run connection revision binding', () => {
  it('keeps the supplied map unchanged through the workflow probe', async () => {
    let resolveHealth!: (value: ReturnType<typeof health>) => void;
    const fetch = vi.fn().mockReturnValueOnce(new Promise<ReturnType<typeof health>>((resolve) => { resolveHealth = resolve; }))
      .mockResolvedValueOnce(response({ executionId: 'run', pipelineId: 'p1', status: 'RUNNING' }));
    global.fetch = fetch;
    const connections = { warehouse: 'runtime-confirmed' };
    const running = runPipeline('p1', 'acme', 'r1', 'request-1', connections);
    connections.warehouse = 'changed-during-probe';
    resolveHealth(health());
    await running;
    expect(JSON.parse(fetch.mock.calls[1][1].body).expectedConnections).toEqual({ warehouse: 'runtime-confirmed' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/connections'))).toBe(false);
  });

  it('sends an explicit empty map for a resource-free run', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(health()).mockResolvedValueOnce(response({ executionId: 'run', pipelineId: 'p1', status: 'RUNNING' }));
    global.fetch = fetch;
    await runPipeline('p1', 'acme', 'r1', 'request-1', {});
    expect(JSON.parse(fetch.mock.calls[1][1].body).expectedConnections).toEqual({});
  });

  it.each([undefined, null, [], { warehouse: '' }])('rejects a missing or invalid binding before any request', async (connections) => {
    const fetch = vi.fn(); global.fetch = fetch;
    await expect(runPipeline('p1', 'acme', 'r1', 'request-1', connections as unknown as Record<string, string>)).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not retry a lost submit using another binding', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(health()).mockRejectedValueOnce(new TypeError('lost response'));
    global.fetch = fetch;
    await expect(runPipeline('p1', 'acme', 'r1', 'request-1', { warehouse: 'runtime-original' })).rejects.toThrow('lost response');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1][1].body).expectedConnections).toEqual({ warehouse: 'runtime-original' });
  });
});

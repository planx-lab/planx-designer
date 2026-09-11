import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionRuntimeRevisions, getConnection, getConnectionImpact, getConnectionKinds, getConnections, saveConnection } from './connections';
import { useConnectionRevisionStore } from '@/stores/useConnectionRevisionStore';
import type { ConnectionMutation, ConnectionResource } from '@/types/connection';

const saved: ConnectionResource = {
  id: 'db/one', tenantId: 'tenant a', driver: 'catalog-driver', name: 'Warehouse',
  parameters: { host: 'db.local', port: '15432' }, revision: 'revision-1', runtimeRevision: 'runtime-1',
  version: 1, configuredSecrets: { password: true }, ready: true,
};
const candidate = (edit = false): ConnectionMutation => ({
  connection: { id: saved.id, tenantId: saved.tenantId, driver: saved.driver, name: saved.name, parameters: { ...saved.parameters } },
  ...(edit ? { expectedRevision: saved.revision } : {}),
  secrets: { password: edit ? { action: 'keep' } : { action: 'replace', value: 'synthetic-password' } },
});
const response = (value: unknown) => new Response(JSON.stringify(value));
const health = () => response({ status: 'ok', pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v1' });
const server = (value: unknown) => vi.fn((url: string) =>
  Promise.resolve(url.endsWith('/healthz') ? health() : response(value)));

beforeEach(() => useConnectionRevisionStore.setState({ revisions: {}, fingerprints: {} }));
afterEach(() => vi.unstubAllGlobals());

describe('structured connection API', () => {
  it('uses the Catalog profiles without a client driver list', async () => {
    const kinds = [{ kind: 'new-catalog-kind', fields: [{ name: 'headers', label: 'Headers JSON', secret: true }] }];
    const fetch = server(kinds); vi.stubGlobal('fetch', fetch);
    expect(await getConnectionKinds('tenant a')).toEqual(kinds);
    expect(fetch.mock.calls[0][0]).toBe('/api/healthz');
    expect(fetch.mock.calls[1][0]).toBe('/api/connection-kinds?tenantId=tenant%20a');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('projects scoped metadata and never retains legacy or extra secret properties', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ connections: [
      { ...saved, dsnEnv: 'PLANX_OLD', secrets: { password: 'must-not-retain' } },
      { ...saved, tenantId: 'other', id: 'hidden' },
    ] }));
    vi.stubGlobal('fetch', fetch);
    expect(await getConnections(saved.tenantId)).toEqual([saved]);
    expect(JSON.stringify(useConnectionRevisionStore.getState())).not.toMatch(/PLANX_OLD|must-not-retain|db.local/);
  });

  it('creates and updates with distinct methods, editor CAS and the reviewed impact token', async () => {
    const fetch = server(saved); vi.stubGlobal('fetch', fetch);
    await saveConnection(candidate());
    await saveConnection({ ...candidate(true), stopAffected: true, impactToken: 'impact-1' }, 'runtime-0');
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[0][0]).toBe('/api/healthz');
    expect(fetch.mock.calls[1][0]).toBe('/api/connections');
    expect(fetch.mock.calls[1][1]?.method).toBe('POST');
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual(candidate());
    expect(fetch.mock.calls[2][0]).toBe('/api/healthz');
    expect(fetch.mock.calls[3][0]).toBe('/api/connections/db%2Fone');
    expect(fetch.mock.calls[3][1]?.method).toBe('PUT');
    expect(JSON.parse(String(fetch.mock.calls[3][1]?.body))).toEqual({ ...candidate(true), stopAffected: true, impactToken: 'impact-1' });
  });

  it.each([
    { ...candidate(), secrets: { password: { action: 'keep' as const } } },
    { ...candidate(true), expectedRevision: '' },
    { ...candidate(), secrets: { password: { action: 'replace' as const, value: '' } } },
    { ...candidate(true), stopAffected: true },
  ])('rejects invalid mutations before dispatch', async (mutation) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(saveConnection(mutation)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reviews the same candidate without stopping or saving', async () => {
    const impact = { runtimeChanged: true, users: [{ id: 'preview-1', kind: 'preview' }], pipelines: [{ id: 'p1', name: 'Orders' }], token: 'impact-1' };
    const fetch = server(impact); vi.stubGlobal('fetch', fetch);
    expect(await getConnectionImpact(candidate(true))).toEqual(impact);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe('/api/healthz');
    expect(fetch.mock.calls[1][0]).toBe('/api/connections/db%2Fone/impact');
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual(candidate(true));
  });

  it('does not replay a revision or impact conflict', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(health()).mockResolvedValueOnce(new Response('conflict', { status: 409 }));
    vi.stubGlobal('fetch', fetch);
    await expect(saveConnection(candidate(true))).rejects.toMatchObject({ status: 409 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].method).toBe('PUT');
  });

  it('queries one encoded tenant resource without sending a mutation', async () => {
    const fetch = vi.fn().mockResolvedValue(response(saved)); vi.stubGlobal('fetch', fetch);
    expect(await getConnection(saved.id, saved.tenantId)).toEqual(saved);
    expect(fetch.mock.calls[0][0]).toBe('/api/connections/db%2Fone?tenantId=tenant%20a');
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });

  it('rejects a response from a different tenant', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...saved, tenantId: 'other' })));
    await expect(getConnection(saved.id, saved.tenantId)).rejects.toThrow(/scoped/);
  });

  it('keeps evidence for name-only edits and invalidates it for runtime changes', async () => {
    useConnectionRevisionStore.getState().observe(saved.tenantId, [saved]);
    const revision = useConnectionRevisionStore.getState().revisions[saved.tenantId];
    const renamed = { ...saved, name: 'Renamed', revision: 'revision-2', version: 2 };
    const changed = { ...renamed, revision: 'revision-3', runtimeRevision: 'runtime-2', version: 3 };
    const fetch = vi.fn().mockResolvedValueOnce(health()).mockResolvedValueOnce(response(renamed))
      .mockResolvedValueOnce(response({ connections: [renamed] })).mockResolvedValueOnce(health()).mockResolvedValueOnce(response(changed));
    vi.stubGlobal('fetch', fetch);
    await saveConnection(candidate(true), saved.runtimeRevision);
    await getConnections(saved.tenantId);
    expect(useConnectionRevisionStore.getState().revisions[saved.tenantId]).toBe(revision);
    await saveConnection({ ...candidate(true), expectedRevision: renamed.revision }, renamed.runtimeRevision);
    expect(useConnectionRevisionStore.getState().revisions[saved.tenantId]).toBeGreaterThan(revision);
  });

  it('invalidates old runtime evidence after an uncertain save without retrying', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(health()).mockRejectedValueOnce(new TypeError('response lost')); vi.stubGlobal('fetch', fetch);
    await expect(saveConnection(candidate(true), saved.runtimeRevision)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].method).toBe('PUT');
    expect(useConnectionRevisionStore.getState().revisions[saved.tenantId]).toBe(1);
  });

  it.each([
    { name: 'missing workflows', features: {} },
    { name: 'draft-only Engine', features: { pipelineWorkflow: 'draft-v1' } },
    { name: 'managed-only Engine', features: { connectionWorkflow: 'managed-v1' } },
    { name: 'wrong connection workflow', features: { pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v0' } },
    { name: 'wrong draft workflow', features: { pipelineWorkflow: 'draft-v0', connectionWorkflow: 'managed-v1' } },
  ])('refuses managed editor operations on a $name before dispatch', async ({ features }) => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response({ status: 'ok', ...features })));
    vi.stubGlobal('fetch', fetch);
    for (const operation of [
      () => getConnectionKinds(saved.tenantId),
      () => getConnectionImpact(candidate(true)),
      () => saveConnection(candidate()),
      () => saveConnection(candidate(true)),
    ]) {
      fetch.mockClear();
      await expect(operation()).rejects.toMatchObject({ status: 412 });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][0]).toBe('/api/healthz');
      expect(fetch.mock.calls[0][1].method).toBeUndefined();
    }
    expect(useConnectionRevisionStore.getState().revisions).toEqual({});
  });

  it('does not request Catalog fields after a canceled readiness response', async () => {
    let finish!: (value: Response) => void;
    const fetch = vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const loading = getConnectionKinds(saved.tenantId, controller.signal);
    controller.abort();
    finish(health());
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/api/healthz');
  });

  it('fails closed on missing tenant or malformed Catalog descriptions', async () => {
    const fetch = server({ kinds: [] }); vi.stubGlobal('fetch', fetch);
    await expect(getConnections(' ')).rejects.toThrow(/Tenant/);
    expect(fetch).not.toHaveBeenCalled();
    await expect(getConnectionKinds('tenant')).rejects.toThrow(/Catalog/);
  });
});

it('projects runtime tokens only and retains unused unready resources in the tenant snapshot', () => {
  const resources = [saved, { ...saved, id: 'not-used', runtimeRevision: 'migration-runtime', ready: false, migrationRequired: true }];
  const revisions = connectionRuntimeRevisions(resources);
  resources[0] = { ...saved, runtimeRevision: 'later-runtime' };
  expect(revisions).toEqual({ 'db/one': 'runtime-1', 'not-used': 'migration-runtime' });
  expect(connectionRuntimeRevisions([])).toEqual({});
});

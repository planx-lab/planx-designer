import { api } from './client';
import { requireManagedWorkflow } from './controlPlane';
import { ApiError } from '@/types/api';
import type { ConnectionImpact, ConnectionKind, ConnectionMutation, ConnectionResource } from '@/types/connection';
import { useConnectionRevisionStore } from '@/stores/useConnectionRevisionStore';

function requireTenant(tenantId: string): void {
  if (!tenantId?.trim()) throw new ApiError(400, 'Tenant context is required for connections.');
}

function stringRecord(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === 'string');
}

/** Project the wire response rather than retaining legacy DSNs or extra secret fields. */
function metadata(value: ConnectionResource, tenantId: string, id?: string): ConnectionResource {
  if (!value || value.tenantId !== tenantId || (id !== undefined && value.id !== id)
    || typeof value.id !== 'string' || !value.id || typeof value.driver !== 'string' || !value.driver
    || typeof value.name !== 'string' || !stringRecord(value.parameters)
    || typeof value.revision !== 'string' || !value.revision
    || typeof value.runtimeRevision !== 'string' || !value.runtimeRevision
    || value.version === undefined || typeof value.ready !== 'boolean'
    || !value.configuredSecrets || Array.isArray(value.configuredSecrets)
    || typeof value.configuredSecrets !== 'object'
    || !Object.values(value.configuredSecrets).every((entry) => typeof entry === 'boolean')) {
    throw new Error('The connection response did not contain scoped structured metadata.');
  }
  return {
    id: value.id, tenantId: value.tenantId, driver: value.driver, name: value.name,
    parameters: { ...value.parameters }, revision: value.revision, runtimeRevision: value.runtimeRevision,
    version: value.version, configuredSecrets: { ...value.configuredSecrets }, ready: value.ready,
    ...(value.migrationRequired === undefined ? {} : { migrationRequired: value.migrationRequired }),
  };
}

export async function getConnections(tenantId: string, signal?: AbortSignal): Promise<ConnectionResource[]> {
  requireTenant(tenantId);
  const result = await api.get<{ connections: ConnectionResource[] }>(
    `/connections?tenantId=${encodeURIComponent(tenantId)}`, { signal },
  );
  if (!Array.isArray(result?.connections)) throw new Error('Connection resources unavailable.');
  const resources = result.connections.filter((connection) => connection?.tenantId === tenantId)
    .map((connection) => metadata(connection, tenantId));
  if (signal?.aborted) throw new DOMException('Connection request cancelled.', 'AbortError');
  useConnectionRevisionStore.getState().observe(tenantId, resources);
  return resources;
}

/** Capture a tenant snapshot without scanning component-specific configuration. */
export function connectionRuntimeRevisions(resources: readonly ConnectionResource[]): Record<string, string> {
  return Object.fromEntries(resources.map(({ id, runtimeRevision }) => [id, runtimeRevision]));
}

export async function getConnection(id: string, tenantId: string, signal?: AbortSignal): Promise<ConnectionResource> {
  requireTenant(tenantId);
  if (!id.trim()) throw new ApiError(400, 'A connection ID is required.');
  const result = await api.get<ConnectionResource>(
    `/connections/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`, { signal },
  );
  return metadata(result, tenantId, id);
}

/** Profiles come from the same Catalog as the components, never a UI driver list. */
export async function getConnectionKinds(tenantId: string, signal?: AbortSignal): Promise<ConnectionKind[]> {
  requireTenant(tenantId);
  await requireManagedWorkflow(signal);
  if (signal?.aborted) throw new DOMException('Connection request cancelled.', 'AbortError');
  const result = await api.get<ConnectionKind[]>(
    `/connection-kinds?tenantId=${encodeURIComponent(tenantId)}`, { signal },
  );
  if (!Array.isArray(result) || result.some((profile) => !profile || typeof profile.kind !== 'string'
    || !profile.kind || !Array.isArray(profile.fields)
    || profile.fields.some((field) => !field || typeof field.name !== 'string' || !field.name
      || typeof field.label !== 'string'
      || (field.options !== undefined && (!Array.isArray(field.options) || field.options.some((option) => typeof option !== 'string'))))
    || new Set(profile.fields.map((field) => field.name)).size !== profile.fields.length)
    || new Set(result.map((profile) => profile.kind)).size !== result.length) {
    throw new Error('Connection field descriptions are unavailable from the Catalog.');
  }
  return result;
}

function checkedMutation(input: ConnectionMutation): ConnectionMutation {
  const { connection, expectedRevision, secrets, stopAffected, impactToken } = input;
  requireTenant(connection?.tenantId);
  if (!connection.id?.trim() || connection.id.length > 128 || !connection.driver?.trim() || !connection.name?.trim()
    || !stringRecord(connection.parameters)) {
    throw new ApiError(400, 'A connection ID, kind, name and structured parameters are required.');
  }
  if (expectedRevision !== undefined && !expectedRevision.trim()) {
    throw new ApiError(400, 'The editor-base revision is required for updates.');
  }
  if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) {
    throw new ApiError(400, 'Explicit credential actions are required.');
  }
  for (const action of Object.values(secrets)) {
    if (!action || !['keep', 'replace', 'clear'].includes(action.action)
      || (action.action === 'keep' && expectedRevision === undefined)
      || (action.action === 'replace' && (typeof action.value !== 'string' || action.value.length === 0))
      || (action.action !== 'replace' && action.value !== undefined)) {
      throw new ApiError(400, 'Use explicit keep, replace or clear credential actions; new connections cannot keep credentials.');
    }
  }
  if (stopAffected && (!expectedRevision || !impactToken)) {
    throw new ApiError(400, 'Stopping affected users requires the reviewed revision and impact token.');
  }
  return {
    connection: {
      id: connection.id, tenantId: connection.tenantId, driver: connection.driver,
      name: connection.name, parameters: { ...connection.parameters },
    },
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
    secrets: Object.fromEntries(Object.entries(secrets).map(([key, action]) => [
      key, action.action === 'replace' ? { action: action.action, value: action.value } : { action: action.action },
    ])),
    ...(stopAffected === undefined ? {} : { stopAffected }),
    ...(impactToken === undefined ? {} : { impactToken }),
  };
}

export async function getConnectionImpact(input: ConnectionMutation): Promise<ConnectionImpact> {
  const mutation = checkedMutation(input);
  if (!mutation.expectedRevision) throw new ApiError(400, 'An editor-base revision is required to review changes.');
  await requireManagedWorkflow();
  const result = await api.post<ConnectionImpact>(
    `/connections/${encodeURIComponent(mutation.connection.id)}/impact`, mutation,
  );
  if (!result || typeof result.runtimeChanged !== 'boolean' || !Array.isArray(result.users) || !Array.isArray(result.pipelines)
    || typeof result.token !== 'string' || !result.token
    || result.users.some((user) => !user || typeof user.id !== 'string' || typeof user.kind !== 'string')
    || result.pipelines.some((pipeline) => !pipeline || typeof pipeline.id !== 'string' || typeof pipeline.name !== 'string')) {
    throw new Error('A complete impact result was not returned. No changes were applied.');
  }
  return result;
}

/** No retry: a lost mutation response is not proof that nothing was saved. */
export async function saveConnection(input: ConnectionMutation, previousRuntimeRevision?: string): Promise<ConnectionResource> {
  const mutation = checkedMutation(input);
  await requireManagedWorkflow();
  try {
    const result = mutation.expectedRevision === undefined
      ? await api.post<ConnectionResource>('/connections', mutation)
      : await api.put<ConnectionResource>(`/connections/${encodeURIComponent(mutation.connection.id)}`, mutation);
    const saved = metadata(result, mutation.connection.tenantId, mutation.connection.id);
    if (saved.driver !== mutation.connection.driver) throw new Error('The connection kind does not match the submitted connection.');
    if (saved.runtimeRevision !== previousRuntimeRevision) {
      useConnectionRevisionStore.getState().invalidate(saved.tenantId);
    }
    return saved;
  } catch (error) {
    // Conflicts and uncertain outcomes cannot leave old runtime evidence looking current.
    if (!(error instanceof ApiError) || error.status === 409 || error.status === 408 || error.status >= 500) {
      useConnectionRevisionStore.getState().invalidate(mutation.connection.tenantId);
    }
    throw error;
  }
}

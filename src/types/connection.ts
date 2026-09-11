import type { LosslessNumber } from 'lossless-json';

/** Only nonsecret metadata may leave the resource API. */
export interface ConnectionResource {
  id: string;
  tenantId: string;
  driver: string;
  name: string;
  parameters: Record<string, string>;
  revision: string;
  runtimeRevision: string;
  version: number | LosslessNumber;
  configuredSecrets: Record<string, boolean>;
  ready: boolean;
  migrationRequired?: boolean;
}

export type ConnectionMetadata = Pick<ConnectionResource, 'id' | 'tenantId' | 'driver' | 'name' | 'parameters'>;

export interface ConnectionKind {
  kind: string;
  fields: {
    name: string;
    label: string;
    description?: string;
    secret?: boolean;
    required?: boolean;
    options?: string[];
  }[];
}

export type ConnectionSecretAction =
  | { action: 'keep' | 'clear'; value?: never }
  | { action: 'replace'; value: string };

export interface ConnectionMutation {
  connection: ConnectionMetadata;
  expectedRevision?: string;
  secrets: Record<string, ConnectionSecretAction>;
  stopAffected?: boolean;
  impactToken?: string;
}

export interface ConnectionImpact {
  runtimeChanged: boolean;
  users: { id: string; kind: string; pipelineId?: string; executionId?: string }[];
  pipelines: { id: string; name: string }[];
  token: string;
}

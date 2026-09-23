/** Plugin types — matches the new Plugin Discovery Protocol (ADR-008/009).
 *  GET /plugins returns PluginInfo[] (Plan 3 engine). */

import type { LosslessNumber } from 'lossless-json';

export type FieldType = 'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN' | 'SECRET' | 'ENUM' | 'OBJECT' | 'ARRAY';

export interface ConfigValue {
  stringValue?: string;
  intValue?: number | string | LosslessNumber;
  numberValue?: number | string | LosslessNumber;
  boolValue?: boolean;
}

export interface ConfigField {
  properties?: ConfigField[];
  name: string;
  type: FieldType;
  label?: string;
  description?: string;
  required?: boolean;
  defaultValue?: ConfigValue;
  enumValues?: string[];
  placeholder?: string;
}

export interface ConfigSchema {
  fields: ConfigField[];
}

export type ComponentKind = 'source' | 'processor' | 'sink';

/** Server-advertised hooks, not connection health or successful operation results. */
export interface ComponentOperations {
  testConnection: boolean;
  checkCompatibility: boolean;
  preview?: boolean;
  /** Omitted is unknown, including external protocols without hook metadata. */
  discoverSchema?: boolean;
}

/** One component of a plugin (runtime unit). */
export interface ComponentInfo {
  id: string;           // e.g. "source" (Plan 3 single-component convention)
  kind: ComponentKind;
  displayName: string;
  description?: string;
  configSchema?: ConfigSchema;
  operations?: ComponentOperations;
  /** Managed connection profile kinds declared by this component's Factory. */
  connectionKinds?: string[];
  origin?: 'builtin' | 'external';
  availability?: 'available';
  /** Opaque server capabilities until the typed schema contract is assigned. */
  capabilities?: unknown;
}

/** A self-describing plugin (package). */
export interface PluginInfo {
  id: string;           // e.g. "source-hello"
  version: string;
  displayName: string;
  description?: string;
  components: ComponentInfo[];
  origin?: 'builtin' | 'external';
  availability?: 'available';
  capabilities?: unknown;
}

/** A discovered table (schema-discovery: ADR-013). */
export interface TableInfo {
  /** Absent means an older external component did not declare the object kind. */
  kind?: 'TABLE' | 'VIEW';
  schema: string;
  name: string;
}

/** A discovered column (schema-discovery: ADR-013). */
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

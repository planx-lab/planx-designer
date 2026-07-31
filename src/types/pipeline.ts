/** PipelineSpec v4 DAG types. FROZEN — matches planx-spec/dag-spec.md (ADR-001). */

/** Canonical protocol version. Domain-agnostic (planx/v4), forward-compatible
 *  to planx/v5. Centralized so a version bump is a one-line change.
 *  See planx-spec/unified-ui-design.md §3.3. */
export const API_VERSION = 'planx/v4';

export type NodeKind = 'source' | 'processor' | 'sink';

export interface NodeSpec {
  id: string;
  kind: NodeKind;
  /** Plugin that owns the component (replaces the old `plugin` string). Plan 6 / ADR-009. */
  plugin_id: string;
  /** Component within the plugin to invoke (ADR-009). */
  component_id: string;
  config?: Record<string, unknown>;
}

export interface EdgeSpec {
  from: string;
  to: string;
}

export interface PipelineSpec {
  apiVersion: typeof API_VERSION;
  kind: 'Pipeline';
  metadata: { name: string; tenantId: string };
  spec: {
    nodes: NodeSpec[];
    edges: EdgeSpec[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

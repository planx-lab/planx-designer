/** PipelineSpec v4 DAG types. FROZEN — matches planx-spec/dag-spec.md (ADR-001). */

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
  apiVersion: 'planx.io/v4';
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

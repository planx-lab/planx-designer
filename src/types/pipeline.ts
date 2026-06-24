/** PipelineSpec v4 DAG types. FROZEN — matches planx-spec/dag-spec.md (ADR-001). */

export type NodeKind = 'source' | 'processor' | 'sink';

export interface NodeSpec {
  id: string;
  kind: NodeKind;
  plugin: string;
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

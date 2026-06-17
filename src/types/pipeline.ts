/**
 * PipelineSpec v4 TypeScript types.
 *
 * FROZEN — must exactly match planx-spec/planx-spec.md.
 * DO NOT add runtime fields (session IDs, gRPC addresses, binary paths).
 */

/** A single node within a pipeline spec (source, processor, or sink). */
export interface NodeSpec {
  /** Unique node identifier within the pipeline. */
  name: string;
  /** Plugin identifier — must exist in the plugin registry. */
  plugin: string;
  /** Opaque plugin configuration. Engine never parses this. */
  config?: Record<string, unknown>;
}

/** The canonical Planx 4.0 pipeline specification. */
export interface PipelineSpec {
  apiVersion: 'planx.io/v4';
  kind: 'Pipeline';
  metadata: {
    name: string;
    tenantId: string;
  };
  spec: {
    source: NodeSpec;
    processors?: NodeSpec[];
    sink: NodeSpec;
  };
}

/** Validation result returned by validateSpec(). */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

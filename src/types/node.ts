import type { Node } from '@xyflow/react';
import type { PluginType } from './plugin';

/** Data stored inside each React Flow node. */
export interface PipelineNodeData {
  [key: string]: unknown;
  /** Planx node type — determines position constraints in the linear chain. */
  nodeType: PluginType;
  /** User-assigned name (unique within the pipeline). */
  name: string;
  /** Plugin identifier (e.g. "source-hello"). */
  plugin: string;
  /** Human-readable label from the plugin descriptor. */
  pluginLabel: string;
  /** Opaque JSON config. */
  config: Record<string, unknown>;
  /** Whether the node passes local validation. */
  isValid: boolean;
  /** Validation error message when !isValid. */
  errorMessage?: string;
  /**
   * Position index in the linear chain.
   * 0 = source, N = sink. Processors fill 1..N-1.
   * Managed by the store; never surfaced in the UI.
   */
  _order: number;
}

/** Typed React Flow node for pipeline rendering. */
export type PipelineNode = Node<PipelineNodeData, 'pipelineNode'>;

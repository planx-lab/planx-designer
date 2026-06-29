import type { Node } from '@xyflow/react';
import type { ComponentKind } from './plugin';

/** Data stored inside each React Flow node. */
export interface PipelineNodeData {
  [key: string]: unknown;
  /** Planx node type — determines position constraints in the linear chain. */
  nodeType: ComponentKind;     // was PluginType
  /** User-assigned name (unique within the pipeline). */
  name: string;
  /** Plugin identifier (e.g. "source-hello"). */
  pluginId: string;            // was plugin
  /** Component within the plugin to invoke. */
  componentId: string;         // NEW
  /** Human-readable label from the plugin descriptor. */
  pluginLabel: string;
  /** Opaque JSON config. */
  config: Record<string, unknown>;
  /** Whether the node passes local validation. */
  isValid: boolean;
  /** Validation error message when !isValid. */
  errorMessage?: string;
}

/** Typed React Flow node for pipeline rendering. */
export type PipelineNode = Node<PipelineNodeData, 'pipelineNode'>;

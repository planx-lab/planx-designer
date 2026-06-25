import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { PipelineNode } from './PipelineNode';
import type { PipelineNode as PipelineNodeType } from '@/types/node';

const nodeTypes = { pipelineNode: PipelineNode };

const proOptions = { hideAttribution: true };

export function PipelineCanvas() {
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const onConnect = usePipelineStore((s) => s.onConnect);
  const onEdgesDelete = usePipelineStore((s) => s.onEdgesDelete);
  const onNodesDelete = usePipelineStore((s) => s.onNodesDelete);
  const selectNode = useUIStore((s) => s.selectNode);

  const handleSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[] }) => {
      if (selected.length === 1) {
        selectNode(selected[0].id);
      } else {
        selectNode(null);
      }
    },
    [selectNode],
  );

  const handleNodesChange = useCallback(
    (_changes: NodeChange<PipelineNodeType>[]) => {
      // Node positions are managed by computeLayout().
      // We ignore manual position changes to enforce auto-layout.
    },
    [],
  );

  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (deleted.length === 0) return;
      onEdgesDelete(deleted.map((e) => e.id));
    },
    [onEdgesDelete],
  );

  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      if (deleted.length === 0) return;
      onNodesDelete(deleted.map((n) => n.id));
    },
    [onNodesDelete],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onConnect={onConnect}
      onEdgesDelete={handleEdgesDelete}
      onNodesDelete={handleNodesDelete}
      onNodesChange={handleNodesChange}
      onSelectionChange={handleSelectionChange}
      proOptions={proOptions}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      attributionPosition="bottom-left"
      className="bg-background"
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
    >
      <Background color="#334155" gap={20} />
      <Controls className="!bg-surface !border-border !rounded-lg" />
    </ReactFlow>
  );
}

import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeChange,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { PipelineNode } from './PipelineNode';
import type { PipelineNode as PipelineNodeType } from '@/types/node';
import type { PluginType } from '@/types/plugin';

const nodeTypes = { pipelineNode: PipelineNode };

const proOptions = { hideAttribution: true };

export function PipelineCanvas() {
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const onConnect = usePipelineStore((s) => s.onConnect);
  const onEdgesDelete = usePipelineStore((s) => s.onEdgesDelete);
  const onNodesDelete = usePipelineStore((s) => s.onNodesDelete);
  const applyNodeChanges = usePipelineStore((s) => s.applyNodeChanges);
  const addNodeAt = usePipelineStore((s) => s.addNodeAt);
  const selectNode = useUIStore((s) => s.selectNode);
  const { screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

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
    (changes: NodeChange<PipelineNodeType>[]) => {
      // dag-designer.md §5.5: nodes are draggable. Delegate to store's
      // applyNodeChanges which handles position, selection, and removal
      // (with source/sink cardinality protection).
      applyNodeChanges(changes);
    },
    [applyNodeChanges],
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/planx-plugin');
      if (!raw) return;
      const { type, plugin, label } = JSON.parse(raw) as {
        type: PluginType;
        plugin: string;
        label: string;
      };
      // Convert screen coords to ReactFlow canvas coords
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(type, plugin, label, position.x, position.y);
    },
    [addNodeAt, screenToFlowPosition],
  );

  return (
    <div ref={wrapperRef} className="w-full h-full" onDrop={handleDrop} onDragOver={handleDragOver}>
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
    </div>
  );
}

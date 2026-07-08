import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Trash2 } from 'lucide-react';

import type { PipelineNodeData } from '@/types/node';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';

const typeColors: Record<string, string> = {
  source: 'border-source/50 bg-source/10',
  processor: 'border-processor/50 bg-processor/10',
  sink: 'border-sink/50 bg-sink/10',
};

const typeBadgeColors: Record<string, string> = {
  source: 'bg-source/20 text-source',
  processor: 'bg-processor/20 text-processor',
  sink: 'bg-sink/20 text-sink',
};

export const PipelineNode = memo(function PipelineNode({
  id,
  data,
  selected,
}: {
  id: string;
  data: PipelineNodeData;
  selected: boolean;
}) {
  const removeNode = usePipelineStore((s) => s.removeNode);
  const selectNode = useUIStore((s) => s.selectNode);

  const canDelete = data.nodeType === 'processor';

  return (
    <div
      onClick={() => selectNode(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectNode(id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${data.nodeType} node: ${data.pluginLabel || data.pluginId || 'Unconfigured'}`}
      className={`
        relative w-[260px] rounded-xl border-2 p-4 transition-all duration-200
        ${typeColors[data.nodeType]}
        ${selected ? 'ring-2 ring-accent border-accent' : 'border-border/50 hover:border-border'}
        cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
      `}
    >
      {/* Handles — per kind constraints: source=output-only, sink=input-only, processor=both */}
      {(data.nodeType === 'sink' || data.nodeType === 'processor') && (
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-border !w-3 !h-3"
        />
      )}
      {(data.nodeType === 'source' || data.nodeType === 'processor') && (
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-border !w-3 !h-3"
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${typeBadgeColors[data.nodeType]}`}
        >
          {data.nodeType}
        </span>
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeNode(id);
            }}
            aria-label={`Delete ${data.nodeType} node`}
            className="text-foreground/50 hover:text-destructive transition-colors p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Plugin name */}
      <p className="text-foreground/90 text-sm font-medium truncate">
        {data.pluginLabel || data.pluginId || 'Unconfigured'}
      </p>

      {/* Node name */}
      {data.name && (
        <p className="text-foreground/50 text-xs mt-0.5 truncate">
          {data.name}
        </p>
      )}

      {/* Config indicator */}
      {Object.keys(data.config).length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-foreground/50 text-[10px]">Configured</span>
        </div>
      )}
    </div>
  );
});

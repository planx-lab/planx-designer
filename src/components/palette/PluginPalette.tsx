import { useState, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';

import { usePaletteStore } from '@/stores/usePaletteStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import type { ComponentKind } from '@/types/plugin';
import type { PaletteItem } from '@/lib/connectors';

const PLUGIN_BADGE =
  'bg-surface-hover text-foreground/50 border border-border';

const tabs: { type: ComponentKind; label: string }[] = [
  { type: 'source', label: 'Sources' },
  { type: 'processor', label: 'Processors' },
  { type: 'sink', label: 'Sinks' },
];

export function PluginPalette() {
  const [activeTab, setActiveTab] = useState<ComponentKind>('source');
  const [search, setSearch] = useState('');

  const plugins = usePaletteStore((s) => s.plugins);
  const error = usePaletteStore((s) => s.error);
  const loading = usePaletteStore((s) => s.loading);
  const fetchPlugins = usePaletteStore((s) => s.fetchPlugins);
  const addNode = usePipelineStore((s) => s.addNode);
  const getItemsByKind = usePaletteStore((s) => s.getItemsByKind);

  const itemsByKind = useMemo(
    () => getItemsByKind(),
    [getItemsByKind, plugins],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (itemsByKind[activeTab] ?? []).filter(
      (item) =>
        q === '' ||
        `${item.componentDisplayName} ${item.description ?? ''}`
          .toLowerCase()
          .includes(q),
    );
  }, [itemsByKind, activeTab, search]);

  const handleAdd = (item: PaletteItem) => {
    addNode(
      item.kind,
      item.pluginId,
      item.componentId,
      item.componentDisplayName,
    );
  };

  const handleDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData(
      'application/planx-plugin',
      JSON.stringify({
        kind: item.kind,
        plugin_id: item.pluginId,
        component_id: item.componentId,
        label: item.componentDisplayName,
      }),
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-3">
        <p className="text-destructive text-sm text-center">{error}</p>
        <button
          onClick={fetchPlugins}
          className="text-accent text-xs hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground/30"
          />
          <input
            type="text"
            placeholder="Filter components…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Kind tabs */}
      <div className="flex border-b border-border">
        {tabs.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => setActiveTab(type)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === type
                ? 'text-accent border-b-2 border-accent'
                : 'text-foreground/40 hover:text-foreground/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Component list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 && (
          <p className="text-foreground/30 text-xs text-center py-8">
            {loading ? 'Loading…' : 'No components found'}
          </p>
        )}
        {filtered.map((item) => (
          <button
            key={`${item.pluginId}/${item.componentId}`}
            draggable
            onDragStart={(e) => handleDragStart(e, item)}
            onClick={() => handleAdd(item)}
            className="w-full text-left p-3 rounded-lg border border-border hover:border-accent/40 hover:bg-surface-hover transition-all duration-150 group cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground truncate">
                {item.componentDisplayName}
              </span>
              <Plus
                size={14}
                className="text-foreground/20 group-hover:text-accent transition-colors shrink-0 ml-2"
              />
            </div>
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide mt-1 ${PLUGIN_BADGE}`}
            >
              {item.pluginDisplayName}
            </span>
            {item.description && (
              <p className="text-foreground/40 text-[11px] mt-0.5 truncate">
                {item.description}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

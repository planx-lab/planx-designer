import { useState, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';

import { usePaletteStore } from '@/stores/usePaletteStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import type { PluginType } from '@/types/plugin';

const tabs: { type: PluginType; label: string }[] = [
  { type: 'source', label: 'Sources' },
  { type: 'processor', label: 'Processors' },
  { type: 'sink', label: 'Sinks' },
];

export function PluginPalette() {
  const [activeTab, setActiveTab] = useState<PluginType>('source');
  const [search, setSearch] = useState('');

  const plugins = usePaletteStore((s) => s.plugins);
  const error = usePaletteStore((s) => s.error);
  const loading = usePaletteStore((s) => s.loading);
  const fetchPlugins = usePaletteStore((s) => s.fetchPlugins);
  const addNode = usePipelineStore((s) => s.addNode);

  const filtered = useMemo(() => {
    return Object.values(plugins)
      .filter((p) => p.type === activeTab)
      .filter((p) =>
        `${p.name} ${p.description ?? ''}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      );
  }, [plugins, activeTab, search]);

  const handleAdd = (name: string, displayName: string, type: PluginType) => {
    addNode(type, name, displayName || name);
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
            placeholder="Filter plugins…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Tabs */}
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

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 && (
          <p className="text-foreground/30 text-xs text-center py-8">
            {loading ? 'Loading…' : 'No plugins found'}
          </p>
        )}
        {filtered.map((plugin) => (
          <button
            key={plugin.name}
            onClick={() =>
              handleAdd(plugin.name, plugin.displayName ?? plugin.name, plugin.type)
            }
            className="w-full text-left p-3 rounded-lg border border-border hover:border-accent/40 hover:bg-surface-hover transition-all duration-150 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground truncate">
                {plugin.displayName || plugin.name}
              </span>
              <Plus
                size={14}
                className="text-foreground/20 group-hover:text-accent transition-colors shrink-0 ml-2"
              />
            </div>
            {plugin.description && (
              <p className="text-foreground/40 text-[11px] mt-0.5 truncate">
                {plugin.description}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

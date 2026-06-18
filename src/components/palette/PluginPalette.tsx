import { useState, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';

import { usePaletteStore } from '@/stores/usePaletteStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import type { PluginType } from '@/types/plugin';
import {
  groupPluginsByConnector,
  connectorCapabilityList,
  type Connector,
} from '@/lib/connectors';

const tabs: { type: PluginType; label: string }[] = [
  { type: 'source', label: 'Sources' },
  { type: 'processor', label: 'Processors' },
  { type: 'sink', label: 'Sinks' },
];

const KIND_LABEL: Record<PluginType, string> = {
  source: 'Source',
  processor: 'Processor',
  sink: 'Sink',
};

const KIND_BADGE: Record<PluginType, string> = {
  source: 'bg-blue-500/15 text-blue-300',
  processor: 'bg-amber-500/15 text-amber-300',
  sink: 'bg-emerald-500/15 text-emerald-300',
};

export function PluginPalette() {
  const [activeTab, setActiveTab] = useState<PluginType>('source');
  const [search, setSearch] = useState('');

  const plugins = usePaletteStore((s) => s.plugins);
  const error = usePaletteStore((s) => s.error);
  const loading = usePaletteStore((s) => s.loading);
  const fetchPlugins = usePaletteStore((s) => s.fetchPlugins);
  const addNode = usePipelineStore((s) => s.addNode);

  // Group flat plugins into Connectors, then keep only those that
  // implement the active capability tab.
  const connectors = useMemo(
    () => groupPluginsByConnector(Object.values(plugins)),
    [plugins],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return connectors
      .filter((c) => c.capabilities[activeTab])
      .filter(
        (c) =>
          q === '' ||
          `${c.displayName} ${c.description ?? ''}`
            .toLowerCase()
            .includes(q),
      );
  }, [connectors, activeTab, search]);

  const handleAdd = (c: Connector) => {
    const plugin = c.capabilities[activeTab];
    if (!plugin) return;
    addNode(activeTab, plugin.name, c.displayName || plugin.name);
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
            placeholder="Filter connectors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Capability tabs */}
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

      {/* Connector list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 && (
          <p className="text-foreground/30 text-xs text-center py-8">
            {loading ? 'Loading…' : 'No connectors found'}
          </p>
        )}
        {filtered.map((c) => {
          const caps = connectorCapabilityList(c);
          return (
            <button
              key={c.id}
              onClick={() => handleAdd(c)}
              className="w-full text-left p-3 rounded-lg border border-border hover:border-accent/40 hover:bg-surface-hover transition-all duration-150 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground truncate">
                  {c.displayName}
                </span>
                <Plus
                  size={14}
                  className="text-foreground/20 group-hover:text-accent transition-colors shrink-0 ml-2"
                />
              </div>
              {c.description && (
                <p className="text-foreground/40 text-[11px] mt-0.5 truncate">
                  {c.description}
                </p>
              )}
              {/* Capability badges — active kind solid, others faded */}
              {caps.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {caps.map((k) => (
                    <span
                      key={k}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide ${
                        k === activeTab
                          ? KIND_BADGE[k]
                          : 'bg-foreground/5 text-foreground/30'
                      }`}
                    >
                      {KIND_LABEL[k]}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

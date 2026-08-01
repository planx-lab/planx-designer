import { Cpu } from 'lucide-react';
import { usePlugins } from '@/hooks/queries';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import type { PluginInfo, ComponentKind } from '@/types/plugin';

/** Capability badge per component kind. A plugin may ship several components
 *  (e.g. a DB connector with both source + sink), so show one badge each. */
function KindBadge({ kind }: { kind: ComponentKind }) {
  const cls: Record<ComponentKind, string> = {
    source: 'bg-source/15 text-source border-source/20',
    processor: 'bg-processor/15 text-processor border-processor/20',
    sink: 'bg-sink/15 text-sink border-sink/20',
  };
  return (
    <Badge variant="secondary" className={cls[kind]}>
      {kind}
    </Badge>
  );
}

// ── Loading skeleton ──

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="bg-surface border-border rounded-lg h-40 animate-pulse">
          <CardContent className="p-5" />
        </Card>
      ))}
    </div>
  );
}

// ── Plugin card ──

function PluginCard({ plugin }: { plugin: PluginInfo }) {
  const kinds = new Set(plugin.components.map((c) => c.kind));
  return (
    <Card className="bg-surface border-border rounded-lg hover:border-foreground/20 transition-colors">
      <CardHeader className="flex flex-row items-start justify-between pb-3 space-y-0">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground font-mono truncate">
            {plugin.id}
          </h3>
          {plugin.displayName && (
            <p className="text-xs text-foreground/60 mt-0.5 truncate">{plugin.displayName}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {Array.from(kinds).map((k) => (
              <KindBadge key={k} kind={k} />
            ))}
            <span className="text-[10px] uppercase tracking-wider text-foreground/40">
              v{plugin.version}
            </span>
          </div>
        </div>
        <Cpu size={20} className="text-foreground/20 shrink-0" aria-hidden />
      </CardHeader>
      <CardContent className="pt-0">
        {plugin.description ? (
          <p className="text-xs text-foreground/45 line-clamp-2">{plugin.description}</p>
        ) : (
          <p className="text-xs text-foreground/30">{plugin.components.length} component(s)</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── PluginsPage ──

export function PluginsPage() {
  const { data, isLoading, error } = usePlugins();

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive text-sm">Failed to load plugins.</p>
      </div>
    );
  }

  const plugins = data?.plugins ?? [];

  return (
    <div className="p-6 h-full overflow-y-auto">
      {isLoading && <LoadingGrid />}
      {!isLoading && plugins.length === 0 && (
        <div className="flex items-center justify-center h-full text-foreground/30 text-sm">
          No plugins loaded
        </div>
      )}
      {!isLoading && plugins.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plugins.map((plugin) => (
            <PluginCard key={plugin.id} plugin={plugin} />
          ))}
        </div>
      )}
    </div>
  );
}

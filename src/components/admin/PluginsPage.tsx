import { Cpu } from 'lucide-react';
import { usePlugins } from '@/hooks/queries';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardContent,
} from '@/components/ui/card';
import type { PluginDescriptor } from '@/types/admin';

function KindBadge({ kind }: { kind: PluginDescriptor['type'] }) {
  switch (kind) {
    case 'source':
      return (
        <Badge
          variant="secondary"
          className="bg-source/15 text-source border-source/20"
        >
          source
        </Badge>
      );
    case 'processor':
      return (
        <Badge
          variant="secondary"
          className="bg-processor/15 text-processor border-processor/20"
        >
          processor
        </Badge>
      );
    case 'sink':
      return (
        <Badge
          variant="secondary"
          className="bg-sink/15 text-sink border-sink/20"
        >
          sink
        </Badge>
      );
  }
}

function PoolBar({ pool }: { pool: NonNullable<PluginDescriptor['pool']> }) {
  const pct = Math.min(100, ((pool.active + pool.idle) / Math.max(1, pool.max)) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-foreground/50">
        <span>Pool: {pool.active + pool.idle}/{pool.max}</span>
        <span>Active: {pool.active}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-foreground/30">
        <span>Min idle: {pool.minIdle}</span>
        <span>Max idle: {pool.maxIdle}</span>
      </div>
    </div>
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

function PluginCard({ plugin }: { plugin: PluginDescriptor }) {
  return (
    <Card className="bg-surface border-border rounded-lg hover:border-foreground/20 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground font-mono truncate">
            {plugin.name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <KindBadge kind={plugin.type} />
            <span className="text-[10px] uppercase tracking-wider text-foreground/40">
              v{plugin.version}
            </span>
          </div>
        </div>
        <Cpu size={20} className="text-foreground/20 shrink-0" />
      </CardHeader>
      <CardContent className="pt-0">
        {plugin.pool && <PoolBar pool={plugin.pool} />}
        {!plugin.pool && (
          <p className="text-xs text-foreground/30">No pool stats</p>
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
            <PluginCard key={plugin.name} plugin={plugin} />
          ))}
        </div>
      )}
    </div>
  );
}

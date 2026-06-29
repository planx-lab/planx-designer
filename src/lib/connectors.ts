import type { ComponentKind, PluginInfo } from '@/types/plugin';

/**
 * A palette item represents one selectable Component, annotated with its
 * owning Plugin for display. Replaces the old Connector model (ADR-009).
 */
export interface PaletteItem {
  pluginId: string;
  pluginDisplayName: string;
  componentId: string;
  componentDisplayName: string;
  kind: ComponentKind;
  description?: string;
}

/**
 * Flatten all components from a list of plugins into PaletteItems grouped by kind.
 */
export function groupComponentsByKind(
  plugins: PluginInfo[],
): Record<ComponentKind, PaletteItem[]> {
  const groups: Record<ComponentKind, PaletteItem[]> = {
    source: [],
    processor: [],
    sink: [],
  };
  for (const p of plugins) {
    for (const c of p.components) {
      const kind = c.kind as ComponentKind;
      groups[kind].push({
        pluginId: p.id,
        pluginDisplayName: p.displayName || p.id,
        componentId: c.id,
        componentDisplayName: c.displayName || c.id,
        kind,
        description: c.description || p.description,
      });
    }
  }
  for (const k of Object.keys(groups) as ComponentKind[]) {
    groups[k].sort((a, b) =>
      a.componentDisplayName.localeCompare(b.componentDisplayName),
    );
  }
  return groups;
}

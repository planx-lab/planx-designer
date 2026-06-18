import type { PluginDescriptor, PluginType } from '@/types/plugin';

/**
 * A Connector aggregates plugins by their `connector` field.
 * Each capability slot (source/processor/sink) holds the plugin for that
 * kind, or undefined if the connector doesn't implement it.
 *
 * See planx-architecture.md §3 (Connector Model, FROZEN).
 */
export interface Connector {
  /** Connector identity (e.g. "mysql"). */
  id: string;
  /** Human-readable label; falls back to id. */
  displayName: string;
  /** Optional description from any plugin in the group. */
  description?: string;
  /** Per-kind plugin; undefined when the connector lacks that capability. */
  capabilities: Record<PluginType, PluginDescriptor | undefined>;
  /** All raw plugins in this connector (for fallback display). */
  plugins: PluginDescriptor[];
}

const KINDS: PluginType[] = ['source', 'processor', 'sink'];

/**
 * Group a flat plugin list into Connector objects keyed by `connector`.
 * Plugins without an explicit connector field fall back to their own name
 * (the engine applies this), so each becomes its own single-capability connector.
 */
export function groupPluginsByConnector(
  plugins: PluginDescriptor[],
): Connector[] {
  const byId = new Map<string, PluginDescriptor[]>();

  for (const p of plugins) {
    const id = p.connector || p.name;
    const list = byId.get(id);
    if (list) {
      list.push(p);
    } else {
      byId.set(id, [p]);
    }
  }

  const connectors: Connector[] = [];
  for (const [id, group] of byId) {
    const capabilities: Record<PluginType, PluginDescriptor | undefined> = {
      source: undefined,
      processor: undefined,
      sink: undefined,
    };
    for (const p of group) {
      capabilities[p.type] = p;
    }

    // Prefer a plugin with a displayName; else use connector id.
    const named = group.find((p) => p.displayName);
    const description = group.find((p) => p.description)?.description;

    connectors.push({
      id,
      displayName: named?.displayName || id,
      description,
      capabilities,
      plugins: group,
    });
  }

  // Stable order: by display name.
  connectors.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return connectors;
}

/** Return the capability badge labels a connector supports. */
export function connectorCapabilityList(c: Connector): PluginType[] {
  return KINDS.filter((k) => c.capabilities[k] !== undefined);
}

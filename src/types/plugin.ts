/** Plugin types — must match planx-engine/internal/plugin/model/plugin.go. */
export type PluginType = 'source' | 'processor' | 'sink';

/** Plugin descriptor returned by GET /plugins. */
export interface PluginDescriptor {
  name: string;
  type: PluginType;
  /** External-system identity this plugin belongs to (e.g. "mysql"). See planx-architecture.md §3. */
  connector: string;
  version: string;
  protocol: string;
  description?: string;
  runtime?: string;
  capabilities?: Record<string, unknown>;
  sdk?: {
    name: string;
    version: string;
  };
  resources?: {
    max_sessions: number;
  };
  /** Human-readable display name. Falls back to name if absent. */
  displayName?: string;
}

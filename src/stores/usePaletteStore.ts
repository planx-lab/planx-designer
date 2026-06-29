import { create } from 'zustand';
import type { PluginInfo } from '@/types/plugin';
import type { PaletteItem } from '@/lib/connectors';
import { getPlugins } from '@/api/controlPlane';
import { groupComponentsByKind } from '@/lib/connectors';

interface PaletteState {
  plugins: PluginInfo[];
  loading: boolean;
  error: string | null;
}

interface PaletteActions {
  fetchPlugins: () => Promise<void>;
  getItemsByKind: () => ReturnType<typeof groupComponentsByKind>;
  getPlugin: (id: string) => PluginInfo | undefined;
  getComponent: (
    pluginId: string,
    componentId: string,
  ) => PaletteItem | undefined;
}

export const usePaletteStore = create<PaletteState & PaletteActions>(
  (set, get) => ({
    plugins: [],
    loading: false,
    error: null,

    fetchPlugins: async () => {
      set({ loading: true, error: null });
      try {
        const plugins = await getPlugins();
        set({ plugins, loading: false });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to load plugins';
        set({ error: msg, loading: false });
      }
    },

    getItemsByKind: () => groupComponentsByKind(get().plugins),

    getPlugin: (id) => get().plugins.find((p) => p.id === id),

    getComponent: (pluginId, componentId) => {
      for (const p of get().plugins) {
        for (const c of p.components) {
          if (p.id === pluginId && c.id === componentId) {
            return {
              pluginId: p.id,
              pluginDisplayName: p.displayName || p.id,
              componentId: c.id,
              componentDisplayName: c.displayName || c.id,
              kind: c.kind,
              description: c.description || p.description,
            };
          }
        }
      }
      return undefined;
    },
  }),
);

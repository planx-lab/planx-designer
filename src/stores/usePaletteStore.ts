import { create } from 'zustand';
import type { PluginInfo } from '@/types/plugin';
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
  }),
);

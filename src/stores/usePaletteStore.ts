import { create } from 'zustand';
import type { PluginDescriptor, PluginType } from '@/types/plugin';
import { getPlugins } from '@/api/controlPlane';

interface PaletteState {
  plugins: Record<string, PluginDescriptor>;
  loading: boolean;
  error: string | null;
}

interface PaletteActions {
  fetchPlugins: () => Promise<void>;
  getByType: (type: PluginType) => PluginDescriptor[];
  getPlugin: (name: string) => PluginDescriptor | undefined;
}

export const usePaletteStore = create<PaletteState & PaletteActions>(
  (set, get) => ({
    plugins: {},
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

    getByType: (type) =>
      Object.values(get().plugins).filter((p) => p.type === type),

    getPlugin: (name) => get().plugins[name],
  }),
);

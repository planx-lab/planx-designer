import { create } from 'zustand';
import { stringifyJson } from '@/lib/json';
import type { ConnectionResource } from '@/types/connection';

/** Runtime evidence only. No credentials, addresses, display names or persistence. */
export const useConnectionRevisionStore = create<{
  revisions: Record<string, number>;
  fingerprints: Record<string, string>;
  observe: (tenantId: string, resources: ConnectionResource[]) => void;
  invalidate: (tenantId: string) => void;
}>((set) => ({
  revisions: {}, fingerprints: {},
  observe: (tenantId, resources) => {
    const fingerprint = stringifyJson(resources.map(({ id, driver, runtimeRevision, ready, migrationRequired }) =>
      ({ id, driver, runtimeRevision, ready, migrationRequired })).sort((a, b) => a.id.localeCompare(b.id)));
    set((state) => state.fingerprints[tenantId] === fingerprint ? state : {
      fingerprints: { ...state.fingerprints, [tenantId]: fingerprint },
      revisions: { ...state.revisions, [tenantId]: (state.revisions[tenantId] ?? 0) + 1 },
    });
  },
  invalidate: (tenantId) => set((state) => ({ revisions: { ...state.revisions, [tenantId]: (state.revisions[tenantId] ?? 0) + 1 } })),
}));

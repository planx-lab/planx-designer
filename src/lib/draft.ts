import type { Edge } from '@xyflow/react';
import type { PipelineNode } from '@/types/node';

/**
 * localStorage-backed draft persistence for the Pipeline Designer.
 *
 * Only the user-authored pipeline (name, tenantId, nodes, edges) is persisted —
 * never the undo/redo stacks (_past/_future) or transient UI state.
 */

const DRAFT_KEY = 'planx-designer:draft:v1';

export interface Draft {
  name: string;
  tenantId: string;
  nodes: PipelineNode[];
  edges: Edge[];
  savedAt: number;
}

/** Persist a draft. No-op if localStorage is unavailable (SSR / privacy mode). */
export function saveDraft(draft: Omit<Draft, 'savedAt'>): void {
  try {
    const payload: Draft = { ...draft, savedAt: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage disabled — silently drop. The draft is
    // best-effort, not a source of truth.
  }
}

/** Load a previously saved draft, or null if none exists. */
export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (!parsed.nodes || !Array.isArray(parsed.nodes)) return null;
    // Backward compat: old drafts may not have edges
    if (!parsed.edges || !Array.isArray(parsed.edges)) {
      parsed.edges = [];
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Remove the saved draft (e.g. after a successful submit). */
export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

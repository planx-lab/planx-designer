import type { Edge } from '@xyflow/react';
import type { PipelineNode } from '@/types/node';

/**
 * localStorage-backed draft persistence for the Pipeline Designer.
 *
 * Only the user-authored pipeline (name, tenantId, nodes, edges) is persisted —
 * never the undo/redo stacks (_past/_future) or transient UI state.
 */

const DRAFT_KEY = 'planx-designer:draft:v2';

export interface Draft {
  name: string;
  tenantId: string;
  nodes: PipelineNode[];
  edges: Edge[];
  savedAt: number;
}

/**
 * Decide whether the autosave subscription should write a draft for the current
 * state. A draft only represents *unsaved* new work: a brand-new pipeline
 * (pipelineId null) with content. Once the pipeline is persisted (pipelineId
 * set, i.e. submit succeeded) the pipeline lives in the台账 and the localStorage
 * draft is obsolete — writing it back would let a stale draft clobber the
 * just-saved pipeline on the next page refresh. (user-scenario-analysis.md R1)
 */
export function shouldSaveDraft(state: {
  nodes: PipelineNode[];
  pipelineId: string | null;
}): boolean {
  return state.pipelineId === null && state.nodes.length > 0;
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
    // Backward compat: v2+ drafts always have edges
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

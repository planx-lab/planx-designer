/**
 * Human-readable display helpers. The product rule (user-scenario-analysis.md
 * §0): the user's world contains names, not UUIDs. Any surface that shows a
 * pipeline must resolve to the name first; the UUID is a last-resort fallback
 * for pipelines the user never named, and even then only a short slice — never
 * the full UUID as primary text.
 */

import type { PipelineSummary } from '@/types/admin';

/** Length of the UUID prefix used as a last-resort label. */
const UUID_FALLBACK_LEN = 8;

/**
 * Resolve a pipeline row's primary label.
 * - Named pipeline → its name.
 * - Unnamed (empty/whitespace) → first 8 chars of the id (enough to tell rows
 *   apart, short enough not to read as "a UUID").
 * - Neither available → a stable placeholder so the row is never blank.
 */
export function pipelineDisplayName(name: string | undefined, id: string | undefined): string {
  const n = (name ?? '').trim();
  if (n) return n;
  const i = (id ?? '').trim();
  if (i) return i.slice(0, UUID_FALLBACK_LEN);
  return 'Untitled pipeline';
}

/**
 * Build a pipelineId → name lookup from a pipelines list (e.g. for resolving
 * the PIPELINE column on the Executions page, which only carries pipelineId).
 * Returns a function; missing/unnamed ids fall back to a short id slice via
 * pipelineDisplayName so the UUID never appears in full.
 */
export function pipelineNameResolver(pipelines: PipelineSummary[]): (pipelineId: string) => string {
  const byId = new Map<string, string>();
  for (const p of pipelines) {
    byId.set(p.pipelineId, (p.name ?? '').trim());
  }
  return (pipelineId: string) => pipelineDisplayName(byId.get(pipelineId), pipelineId);
}

import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { usePaletteStore } from '@/stores/usePaletteStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { PipelineToolbar } from '@/components/toolbar/PipelineToolbar';
import { DesignerWorkbench } from '@/components/DesignerWorkbench';
import { loadDraft, saveDraft, shouldSaveDraft } from '@/lib/draft';

/** Module-level flag — restore draft only ONCE per session, not on every mount. */
let draftRestored = false;

export function DesignerView() {
  const fetchPlugins = usePaletteStore((s) => s.fetchPlugins);
  const reset = usePipelineStore((s) => s.reset);
  const tenantId = usePipelineStore((s) => s.tenantId);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  // Restore a saved draft only ONCE per session; otherwise init a fresh pipeline.
  // Module-level flag prevents state loss when DesignerView unmounts/remounts
  // (e.g. switching between Designer and Executions views).
  //
  // INVARIANT (user-scenario-analysis.md F1): an explicit "Open" of a pipeline
  // from the台账 must always win — the loaded spec must NOT be clobbered by a
  // stale localStorage draft. The authoritative signal that a real pipeline was
  // loaded is `pipelineId` being set (loadSpec always sets it; reset clears it;
  // a fresh unsaved draft has pipelineId null). We check BOTH pipelineId and
  // node-count so an Open that hasn't yet populated nodes is still protected.
  const restoreDraft = usePipelineStore((s) => s.restoreDraft);
  useEffect(() => {
    if (draftRestored) return;
    draftRestored = true;
    // Don't restore a draft over an explicitly-loaded pipeline. pipelineId set
    // => loadSpec(pipelineId) ran (Open in Designer). nodes present => the store
    // already holds something; a draft would only overwrite real work.
    const now = usePipelineStore.getState();
    if (now.pipelineId !== null || now.nodes.length > 0) return;
    const draft = loadDraft();
    if (draft && draft.nodes.length > 0) {
      restoreDraft({
        name: draft.name,
        tenantId: draft.tenantId,
        nodes: draft.nodes,
        edges: draft.edges ?? [],
      });
    } else if (!tenantId) {
      reset(import.meta.env.VITE_DEFAULT_TENANT ?? 'default-tenant');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced auto-save of the user-authored pipeline (never the undo stacks).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsub = usePipelineStore.subscribe((s) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Only buffer drafts for unsaved new pipelines. Once persisted
        // (pipelineId set) the pipeline lives in the台账; a localStorage draft
        // would be stale and clobber the saved version on refresh.
        if (shouldSaveDraft(s)) {
          saveDraft({ name: s.name, tenantId: s.tenantId, nodes: s.nodes, edges: s.edges });
        }
      }, 500);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  return (
    <ReactFlowProvider>
      <div className="flex h-full min-h-0 flex-col bg-background">
        <PipelineToolbar />
        <DesignerWorkbench />
      </div>
    </ReactFlowProvider>
  );
}

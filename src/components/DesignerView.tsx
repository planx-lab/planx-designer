import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { usePaletteStore } from '@/stores/usePaletteStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { PipelineCanvas } from '@/components/canvas/PipelineCanvas';
import { PluginPalette } from '@/components/palette/PluginPalette';
import { ConfigPanel } from '@/components/editor/ConfigPanel';
import { SpecPreview } from '@/components/preview/SpecPreview';
import { PipelineToolbar } from '@/components/toolbar/PipelineToolbar';
import { useUIStore } from '@/stores/useUIStore';
import { useKeyboardShortcuts } from '@/lib/keyboard';
import { loadDraft, saveDraft } from '@/lib/draft';

/** Module-level flag — restore draft only ONCE per session, not on every mount. */
let draftRestored = false;

/** Registers global keyboard shortcuts. Must be inside ReactFlowProvider. */
function KeyboardManager() {
  useKeyboardShortcuts();
  return null;
}

export function DesignerView() {
  const fetchPlugins = usePaletteStore((s) => s.fetchPlugins);
  const loading = usePaletteStore((s) => s.loading);
  const nodes = usePipelineStore((s) => s.nodes);
  const reset = usePipelineStore((s) => s.reset);
  const tenantId = usePipelineStore((s) => s.tenantId);
  const showPreview = useUIStore((s) => s.showPreview);

  // Collapsible panels (for narrow viewports / focus mode)
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [configOpen, setConfigOpen] = useState(true);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  // Restore a saved draft only ONCE per session; otherwise init a fresh pipeline.
  // Module-level flag prevents state loss when DesignerView unmounts/remounts
  // (e.g. switching between Designer and Executions views).
  const restoreDraft = usePipelineStore((s) => s.restoreDraft);
  useEffect(() => {
    if (draftRestored) return;
    draftRestored = true;
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
        if (s.nodes.length > 0) {
          saveDraft({ name: s.name, tenantId: s.tenantId, nodes: s.nodes, edges: s.edges });
        }
      }, 500);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent mx-auto" />
          <p className="text-foreground/60 text-sm">Loading plugins…</p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <KeyboardManager />
      <div className="flex h-full flex-col bg-background">
        <PipelineToolbar />

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Plugin Palette (collapsible) */}
          {paletteOpen ? (
            <aside className="w-72 shrink-0 border-r border-border bg-surface flex flex-col max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:w-72">
              <div className="flex justify-end p-1">
                <button
                  onClick={() => setPaletteOpen(false)}
                  title="Hide palette"
                  aria-label="Hide palette"
                  className="p-1 rounded text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <PanelLeftClose size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <PluginPalette />
              </div>
            </aside>
          ) : (
            <button
              onClick={() => setPaletteOpen(true)}
              title="Show palette"
              aria-label="Show palette"
              className="w-8 shrink-0 border-r border-border bg-surface flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <PanelLeftOpen size={16} />
            </button>
          )}

          {/* Center: Canvas or Preview */}
          <main className="flex-1 relative">
            {showPreview ? (
              <SpecPreview />
            ) : nodes.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center space-y-3">
                  <p className="text-foreground/50 text-lg">
                    Drag a plugin from the palette to start
                  </p>
                  <p className="text-foreground/40 text-sm">
                    Source → Processors → Sink
                  </p>
                </div>
              </div>
            ) : (
              <PipelineCanvas />
            )}
          </main>

          {/* Right: Config Panel (collapsible) */}
          {configOpen ? (
            <aside className="w-96 shrink-0 border-l border-border bg-surface flex flex-col max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-20 max-md:w-72">
              <div className="flex justify-start p-1">
                <button
                  onClick={() => setConfigOpen(false)}
                  title="Hide config"
                  aria-label="Hide config"
                  className="p-1 rounded text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <PanelRightClose size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ConfigPanel />
              </div>
            </aside>
          ) : (
            <button
              onClick={() => setConfigOpen(true)}
              title="Show config"
              aria-label="Show config"
              className="w-8 shrink-0 border-l border-border bg-surface flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <PanelRightOpen size={16} />
            </button>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}

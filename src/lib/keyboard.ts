import { useEffect } from 'react';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';

/**
 * Global keyboard shortcuts for the Pipeline Designer.
 *
 * Delete / Backspace — Remove the selected node (processors only).
 * Escape            — Deselect the current node.
 * Ctrl+Z            — Undo.
 * Ctrl+Shift+Z      — Redo.
 */
export function useKeyboardShortcuts() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectNode = useUIStore((s) => s.selectNode);
  const removeNode = usePipelineStore((s) => s.removeNode);
  const undo = usePipelineStore((s) => s.undo);
  const redo = usePipelineStore((s) => s.redo);
  const nodes = usePipelineStore((s) => s.nodes);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Undo / Redo work even when focus is in an input
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
        return;
      }
      // Ctrl+Shift+Z on some layouts sends capital Z
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        redo();
        return;
      }

      // Other shortcuts are disabled during text editing
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditing =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        (e.target as HTMLElement)?.isContentEditable;
      if (isEditing) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          const node = nodes.find((n) => n.id === selectedNodeId);
          if (node && node.data.nodeType === 'processor') {
            e.preventDefault();
            removeNode(selectedNodeId);
            selectNode(null);
          }
        }
      }

      if (e.key === 'Escape') {
        if (selectedNodeId) {
          selectNode(null);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, nodes, removeNode, selectNode, undo, redo]);
}

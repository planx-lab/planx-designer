import { create } from 'zustand';
import type { Edge } from '@xyflow/react';
import type { PipelineNode } from '@/types/node';
import type { PluginType } from '@/types/plugin';
import type { PipelineSpec } from '@/types/pipeline';
import {
  buildSpec,
  fromSpec,
  validateSpec,
  generateNodeName,
} from '@/lib/pipeline';
import { toYaml } from '@/lib/yaml';

// ── State ────────────────────────────────────────────────

// ── State ────────────────────────────────────────────────

interface PipelineState {
  name: string;
  tenantId: string;
  nodes: PipelineNode[];
  edges: Edge[];
  /** Undo/redo stacks. Internal; accessed via actions. */
  _past: Snapshot[];
  _future: Snapshot[];
}

type Snapshot = { name: string; nodes: PipelineNode[] };

function snapshot(s: PipelineState): Snapshot {
  return { name: s.name, nodes: s.nodes };
}

// ── Actions ──────────────────────────────────────────────

interface PipelineActions {
  setName: (name: string) => void;
  setTenantId: (id: string) => void;

  /** Add a node of the given type. Replaces existing source/sink if present. */
  addNode: (
    type: PluginType,
    plugin: string,
    pluginLabel: string,
  ) => PipelineNode;

  /** Remove a node by id. Source and sink cannot be removed. */
  removeNode: (id: string) => void;

  /** Update a node's user-assigned name. */
  setNodeName: (id: string, name: string) => void;

  /** Update a node's plugin reference. */
  setPlugin: (id: string, plugin: string, label: string) => void;

  /** Update a node's opaque config. */
  setConfig: (id: string, config: Record<string, unknown>) => void;

  /** Reorder processors after a drag-and-drop (swap _order). */
  moveProcessor: (fromId: string, toId: string) => void;

  /** Initialize from a PipelineSpec. */
  loadSpec: (spec: PipelineSpec) => void;

  // ── Derived ──

  /** Build a PipelineSpec v4 from current state. */
  buildSpec: () => PipelineSpec;

  /** Validate the pipeline. */
  validate: () => { valid: boolean; errors: string[] };

  /** Serialize to YAML string. */
  toYaml: () => string;

  /** Reset to a fresh pipeline with placeholder source + sink. */
  reset: (tenantId: string) => void;

  // ── Undo / Redo ──

  undo: () => void;
  redo: () => void;

  /** Restore a persisted draft (name, tenantId, nodes). Resets history. */
  restoreDraft: (draft: {
    name: string;
    tenantId: string;
    nodes: PipelineNode[];
  }) => void;

  // ── Internal ──

  /** Push current state to undo history before a structural mutation. */
  _pushHistory: () => void;

  /** Re-sync edges and layout after a mutation. */
  _sync: (nodes: PipelineNode[]) => void;
}

// ── Store ────────────────────────────────────────────────

export const usePipelineStore = create<PipelineState & PipelineActions>(
  (set, get) => ({
    name: '',
    tenantId: '',
    nodes: [],
    edges: [],
    _past: [],
    _future: [],

    // Metadata
    setName: (name) => set({ name }),
    setTenantId: (tenantId) => set({ tenantId }),

    // Node lifecycle
    addNode: (type, plugin, pluginLabel) => {
      get()._pushHistory();
      const { nodes } = get();
      const existing = nodes.map((n) => n.data.name);

      const node: PipelineNode = {
        id: crypto.randomUUID(),
        type: 'pipelineNode',
        position: { x: 0, y: 0 },
        data: {
          nodeType: type,
          name: generateNodeName(type, existing),
          plugin,
          pluginLabel,
          config: {},
          isValid: true,
          _order: 0,
        },
      };

      let updated = [...nodes];

      if (type === 'source') {
        // Replace existing source
        updated = updated.filter(
          (n) => n.data.nodeType !== 'source',
        );
        updated.unshift(node);
      } else if (type === 'sink') {
        // Replace existing sink
        updated = updated.filter(
          (n) => n.data.nodeType !== 'sink',
        );
        updated.push(node);
      } else {
        // Insert processor before sink
        const sinkIdx = updated.findIndex(
          (n) => n.data.nodeType === 'sink',
        );
        if (sinkIdx >= 0) {
          updated.splice(sinkIdx, 0, node);
        } else {
          updated.push(node);
        }
      }

      // Reassign _order
      updated = updated.map((n, i) => ({
        ...n,
        data: { ...n.data, _order: i },
      }));

      get()._sync(updated);
      return node;
    },

    removeNode: (id) => {
      get()._pushHistory();
      const { nodes } = get();
      const target = nodes.find((n) => n.id === id);
      if (!target) return;
      // Cannot remove source or sink
      if (
        target.data.nodeType === 'source' ||
        target.data.nodeType === 'sink'
      )
        return;

      const updated = nodes
        .filter((n) => n.id !== id)
        .map((n, i) => ({ ...n, data: { ...n.data, _order: i } }));

      get()._sync(updated);
    },

    // Node mutation
    setNodeName: (id, name) => {
      const updated = get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, name } } : n,
      );
      set({ nodes: updated });
    },

    setPlugin: (id, plugin, label) => {
      const updated = get().nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                plugin,
                pluginLabel: label,
              },
            }
          : n,
      );
      set({ nodes: updated });
    },

    setConfig: (id, config) => {
      const updated = get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config } } : n,
      );
      set({ nodes: updated });
    },

    // Reorder
    moveProcessor: (fromId, toId) => {
      get()._pushHistory();
      const { nodes } = get();
      const fromIdx = nodes.findIndex((n) => n.id === fromId);
      const toIdx = nodes.findIndex((n) => n.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;

      const updated = [...nodes];
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);

      get()._sync(
        updated.map((n, i) => ({
          ...n,
          data: { ...n.data, _order: i },
        })),
      );
    },

    // Spec loading
    loadSpec: (spec) => {
      const { nodes, edges } = fromSpec(spec);
      set({
        name: spec.metadata.name,
        tenantId: spec.metadata.tenantId,
        nodes,
        edges,
      });
    },

    buildSpec: () =>
      buildSpec(get().nodes, get().edges, {
        name: get().name,
        tenantId: get().tenantId,
      }),

    validate: () => validateSpec(get().buildSpec()),

    toYaml: () =>
      toYaml(get().nodes, get().edges, {
        name: get().name,
        tenantId: get().tenantId,
      }),

    reset: (tenantId) => {
      get()._sync([]);
      set({
        name: '',
        tenantId,
        nodes: [],
        edges: [],
        _past: [],
        _future: [],
      });
    },

    restoreDraft: ({ name, tenantId, nodes }) => {
      // Re-key _order and recompute layout/edges; drop history.
      const reordered = nodes.map((n, i) => ({
        ...n,
        data: { ...n.data, _order: i },
      }));
      set({ name, tenantId, _past: [], _future: [] });
      get()._sync(reordered);
    },

    // Undo / Redo
    undo: () => {
      const { _past, _future } = get();
      if (_past.length === 0) return;
      const current = snapshot(get());
      const prev = _past[_past.length - 1];
      set({
        name: prev.name,
        _past: _past.slice(0, -1),
        _future: [current, ..._future],
      });
      get()._sync(prev.nodes);
    },

    redo: () => {
      const { _past, _future } = get();
      if (_future.length === 0) return;
      const current = snapshot(get());
      const next = _future[0];
      set({
        name: next.name,
        _past: [..._past, current],
        _future: _future.slice(1),
      });
      get()._sync(next.nodes);
    },

    // Internal: push history
    _pushHistory: () => {
      const s = get();
      // Don't push if nodes are empty (initial/reset state)
      if (s.nodes.length === 0) return;
      set({
        _past: [...s._past, snapshot(s)],
        _future: [],
      });
    },

    // Internal sync
    _sync: (nodes) => {
      // DAG: edges are user-authorable (Task 4 adds onConnect). For now,
      // nodes are the source of truth; edges remain a plain state field.
      set({ nodes });
    },
  }),
);

// ── Selectors ────────────────────────────────────────────

export const selectSourceNode = (
  s: PipelineState & PipelineActions,
): PipelineNode | undefined =>
  s.nodes.find((n) => n.data.nodeType === 'source');

export const selectSinkNode = (
  s: PipelineState & PipelineActions,
): PipelineNode | undefined =>
  s.nodes.find((n) => n.data.nodeType === 'sink');

export const selectProcessorNodes = (
  s: PipelineState & PipelineActions,
): PipelineNode[] =>
  s.nodes
    .filter((n) => n.data.nodeType === 'processor')
    .sort((a, b) => a.data._order - b.data._order);

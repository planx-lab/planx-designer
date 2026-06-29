import { create } from 'zustand';
import { applyNodeChanges as rfApplyNodeChanges, type Edge, type Connection, type NodeChange } from '@xyflow/react';
import type { PipelineNode } from '@/types/node';
import type { ComponentKind } from '@/types/plugin';
import type { PipelineSpec } from '@/types/pipeline';
import {
  buildSpec,
  fromSpec,
  validateSpec,
  generateNodeName,
} from '@/lib/pipeline';
import { toYaml } from '@/lib/yaml';

// ── State ────────────────────────────────────────────────

interface PipelineState {
  name: string;
  tenantId: string;
  nodes: PipelineNode[];
  edges: Edge[];
  _past: Snapshot[];
  _future: Snapshot[];
}

type Snapshot = { name: string; nodes: PipelineNode[]; edges: Edge[] };

function snapshot(s: PipelineState): Snapshot {
  return { name: s.name, nodes: s.nodes, edges: s.edges };
}

// ── Actions ──────────────────────────────────────────────

interface PipelineActions {
  setName: (name: string) => void;
  setTenantId: (id: string) => void;

  addNode: (type: ComponentKind, pluginId: string, componentId: string, pluginLabel: string) => PipelineNode;
  /** Add a node at a specific canvas position (for drag-from-palette). dag-designer.md §5.2. */
  addNodeAt: (type: ComponentKind, pluginId: string, componentId: string, pluginLabel: string, x: number, y: number) => PipelineNode;
  removeNode: (id: string) => void;

  setNodeName: (id: string, name: string) => void;
  setComponent: (id: string, pluginId: string, componentId: string, label: string) => void;
  setConfig: (id: string, config: Record<string, unknown>) => void;

  /** Edge lifecycle (DAG — user-authored). */
  onConnect: (conn: Connection) => void;
  onEdgesDelete: (edgeIds: string[]) => void;
  onNodesDelete: (nodeIds: string[]) => void;

  /** Apply ReactFlow node changes (position drag, selection, removal). dag-designer.md §5.5. */
  applyNodeChanges: (changes: NodeChange[]) => void;

  loadSpec: (spec: PipelineSpec) => void;
  buildSpec: () => PipelineSpec;
  validate: () => { valid: boolean; errors: string[] };
  toYaml: () => string;
  reset: (tenantId: string) => void;

  undo: () => void;
  redo: () => void;

  restoreDraft: (draft: { name: string; tenantId: string; nodes: PipelineNode[]; edges?: Edge[] }) => void;
  _pushHistory: () => void;
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

    setName: (name) => set({ name }),
    setTenantId: (tenantId) => set({ tenantId }),

    addNode: (type, pluginId, componentId, pluginLabel) => {
      get()._pushHistory();
      const { nodes } = get();
      const existing = nodes.map((n) => n.data.name);

      const node: PipelineNode = {
        id: crypto.randomUUID(),
        type: 'pipelineNode',
        position: { x: 100 + (nodes.length % 3) * 300, y: 100 + Math.floor(nodes.length / 3) * 200 },
        data: {
          nodeType: type,
          name: generateNodeName(type, existing),
          pluginId,
          componentId,
          pluginLabel,
          config: {},
          isValid: true,
        },
      };

      let updated = [...nodes];

      if (type === 'source') {
        updated = updated.filter((n) => n.data.nodeType !== 'source');
        updated.unshift(node);
      } else if (type === 'sink') {
        updated = updated.filter((n) => n.data.nodeType !== 'sink');
        updated.push(node);
      } else {
        updated.push(node);
      }

      get()._sync(updated);
      return node;
    },

    addNodeAt: (type, pluginId, componentId, pluginLabel, x, y) => {
      get()._pushHistory();
      const { nodes } = get();
      const existing = nodes.map((n) => n.data.name);

      const node: PipelineNode = {
        id: crypto.randomUUID(),
        type: 'pipelineNode',
        position: { x, y },
        data: {
          nodeType: type,
          name: generateNodeName(type, existing),
          pluginId,
          componentId,
          pluginLabel,
          config: {},
          isValid: true,
        },
      };

      let updated = [...nodes];

      if (type === 'source') {
        updated = updated.filter((n) => n.data.nodeType !== 'source');
        updated.unshift(node);
      } else if (type === 'sink') {
        updated = updated.filter((n) => n.data.nodeType !== 'sink');
        updated.push(node);
      } else {
        updated.push(node);
      }

      get()._sync(updated);
      return node;
    },

    removeNode: (id) => {
      get()._pushHistory();
      const { nodes, edges } = get();
      const target = nodes.find((n) => n.id === id);
      if (!target) return;
      if (target.data.nodeType === 'source' || target.data.nodeType === 'sink') return;

      const updated = nodes.filter((n) => n.id !== id);
      // Cascade: remove all edges connected to the deleted node.
      const remainingEdges = edges.filter(
        (e) => e.source !== id && e.target !== id,
      );
      set({ nodes: updated, edges: remainingEdges });
    },

    setNodeName: (id, name) => {
      const updated = get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, name } } : n,
      );
      set({ nodes: updated });
    },

    setComponent: (id, pluginId, componentId, label) => {
      const updated = get().nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, pluginId, componentId, pluginLabel: label } }
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

    // ── Edge lifecycle (DAG) ──

    applyNodeChanges: (changes) => {
      // dag-designer.md §5.5: nodes are draggable. ReactFlow's applyNodeChanges
      // handles position drag, selection, and removal. We filter out 'remove'
      // changes for source/sink (cardinality protection in removeNode).
      const safeChanges = changes.filter((c) => {
        if (c.type !== 'remove') return true;
        const node = get().nodes.find((n) => n.id === c.id);
        return node && node.data.nodeType === 'processor';
      });
      const updated = rfApplyNodeChanges(safeChanges, get().nodes) as PipelineNode[];
      set({ nodes: updated });
    },

    onConnect: (conn) => {
      const { nodes, edges } = get();
      if (!conn.source || !conn.target) return;
      // Self-loop
      if (conn.source === conn.target) return;

      // Duplicate edge check
      if (edges.some((e) => e.source === conn.source && e.target === conn.target)) return;

      // Kind constraints: source cannot receive, sink cannot send
      const srcNode = nodes.find((n) => n.id === conn.source);
      const tgtNode = nodes.find((n) => n.id === conn.target);
      if (!srcNode || !tgtNode) return;
      if (tgtNode.data.nodeType === 'source') return; // source can't have in-edge
      if (srcNode.data.nodeType === 'sink') return;    // sink can't have out-edge

      get()._pushHistory();

      const id = `e-${conn.source}-${conn.target}-${Date.now()}`;
      set({ edges: [...edges, { id, source: conn.source, target: conn.target }] });
    },

    onEdgesDelete: (edgeIds) => {
      if (edgeIds.length === 0) return;
      get()._pushHistory();
      const idSet = new Set(edgeIds);
      set({ edges: get().edges.filter((e) => !idSet.has(e.id)) });
    },

    onNodesDelete: (nodeIds) => {
      if (nodeIds.length === 0) return;
      const { nodes } = get();
      // Don't allow deleting source or sink
      const allowed = nodeIds.filter((id) => {
        const n = nodes.find((nd) => nd.id === id);
        return n && n.data.nodeType !== 'source' && n.data.nodeType !== 'sink';
      });
      if (allowed.length === 0) return;
      get()._pushHistory();

      const remaining = nodes.filter((n) => !allowed.includes(n.id));
      // Cascade edges
      const allowedSet = new Set(allowed);
      const remainingEdges = get().edges.filter(
        (e) => !allowedSet.has(e.source) && !allowedSet.has(e.target),
      );
      set({ nodes: remaining, edges: remainingEdges });
    },

    // ── Spec loading / export ──

    loadSpec: (spec) => {
      const { nodes, edges } = fromSpec(spec);
      set({ name: spec.metadata.name, tenantId: spec.metadata.tenantId, nodes, edges });
    },

    buildSpec: () =>
      buildSpec(get().nodes, get().edges, { name: get().name, tenantId: get().tenantId }),

    validate: () => validateSpec(get().buildSpec()),

    toYaml: () =>
      toYaml(get().nodes, get().edges, { name: get().name, tenantId: get().tenantId }),

    reset: (tenantId) => {
      set({ name: '', tenantId, nodes: [], edges: [], _past: [], _future: [] });
    },

    restoreDraft: ({ name, tenantId, nodes, edges }) => {
      set({ name, tenantId, nodes, edges: edges ?? [], _past: [], _future: [] });
    },

    // ── Undo / Redo ──

    undo: () => {
      const { _past, _future } = get();
      if (_past.length === 0) return;
      const current = snapshot(get());
      const prev = _past[_past.length - 1];
      set({
        name: prev.name,
        nodes: prev.nodes,
        edges: prev.edges,
        _past: _past.slice(0, -1),
        _future: [current, ..._future],
      });
    },

    redo: () => {
      const { _past, _future } = get();
      if (_future.length === 0) return;
      const current = snapshot(get());
      const next = _future[0];
      set({
        name: next.name,
        nodes: next.nodes,
        edges: next.edges,
        _past: [..._past, current],
        _future: _future.slice(1),
      });
    },

    _pushHistory: () => {
      const s = get();
      if (s.nodes.length === 0) return;
      set({ _past: [...s._past, snapshot(s)], _future: [] });
    },

    _sync: (nodes) => set({ nodes }),
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
  s.nodes.filter((n) => n.data.nodeType === 'processor');

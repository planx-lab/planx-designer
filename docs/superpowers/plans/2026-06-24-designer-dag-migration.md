# Designer DAG Migration — Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Migrate the Designer from a linear (`source`/`processors`/`sink`, `_order`-derived edges) editor to a DAG (`nodes[]`+`edges[]`, user-authored edges) editor — aligning with the engine DAG contract (Plan 1, done) and ADR-001.

**Architecture:** Edges become first-class (user draws them via `onConnect`); `_order` is deleted; the store snapshots capture edges (so undo/redo works); a TS `validateSpec` mirrors the engine's V-001..V-020; Run posts the DAG spec and polls execution status.

**Tech Stack:** React 19, `@xyflow/react` (ReactFlow), Zustand, TypeScript, vitest. No new deps (CodeMirror + custom components kept — design decision).

**Spec:** `planx-designer/docs/superpowers/specs/2026-06-24-designer-dag-alpha-design.md` §5 (Designer Changes).

**Depends on:** Plan 1 (engine DAG contract) — DONE. The engine accepts DAG specs (`feat/dag-pipeline` branch).

---

## File Structure

**Contract layer (full code below):**
- `src/types/pipeline.ts` — DAG PipelineSpec types.
- `src/types/node.ts` — drop `_order`.
- `src/lib/pipeline.ts` — DAG `buildSpec`/`fromSpec`.
- `src/lib/validation.ts` (new) — TS V-001..V-020.

**UI layer (read current + apply pattern):**
- `src/lib/edges.ts` — delete `computeEdges`/`computeLayout`; keep style helpers.
- `src/stores/usePipelineStore.ts` — edges first-class + `onConnect` + snapshots capture edges.
- `src/components/canvas/PipelineNode.tsx` — handles per kind.
- `src/components/canvas/PipelineCanvas.tsx` — `onConnect`/`onEdgesDelete`.
- `src/components/preview/SpecPreview.tsx` — DAG YAML/JSON + Validation tab.
- `src/api/controlPlane.ts` — `getExecution` polling.

---

## Task 1: DAG types (`types/pipeline.ts` + `types/node.ts`)

**Files:** `src/types/pipeline.ts`, `src/types/node.ts`

- [ ] **Step 1:** Replace `src/types/pipeline.ts` entirely:

```ts
/** PipelineSpec v4 DAG types. FROZEN — matches planx-spec/dag-spec.md (ADR-001). */

export type NodeKind = 'source' | 'processor' | 'sink';

export interface NodeSpec {
  id: string;
  kind: NodeKind;
  plugin: string;
  config?: Record<string, unknown>;
}

export interface EdgeSpec {
  from: string;
  to: string;
}

export interface PipelineSpec {
  apiVersion: 'planx.io/v4';
  kind: 'Pipeline';
  metadata: { name: string; tenantId: string };
  spec: {
    nodes: NodeSpec[];
    edges: EdgeSpec[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

- [ ] **Step 2:** In `src/types/node.ts`, delete the `_order: number` field (and its doc comment). The ReactFlow node `id` becomes the spec node `id`; `nodeType` stays (= kind). Keep `name`, `plugin`, `pluginLabel`, `config`, `isValid`, `errorMessage`. Resulting `PipelineNodeData` has NO `_order`.

- [ ] **Step 3:** `npm run build` (tsc) — expect errors in `lib/pipeline.ts`, `lib/edges.ts`, `stores`, `components` (they reference `_order`/linear spec). This is expected; Tasks 2-6 fix them. Only `types/` must be correct.

- [ ] **Step 4:** Commit: `feat(types): PipelineSpec linear -> DAG (nodes+edges); drop _order`

---

## Task 2: DAG `buildSpec`/`fromSpec` + TS validation (`lib/pipeline.ts` + `lib/validation.ts`)

**Files:** `src/lib/pipeline.ts` (rewrite), `src/lib/validation.ts` (new)

- [ ] **Step 1:** Replace `src/lib/pipeline.ts` with DAG versions. Delete `computeLinearOrder` (DAG has no linear order). Keep `generateNodeName`, `isObjectEmpty`.

```ts
import type { PipelineSpec, NodeSpec, EdgeSpec } from '@/types/pipeline';
import type { PipelineNode } from '@/types/node';
import type { Edge } from '@xyflow/react';
import type { PluginType } from '@/types/plugin';
import { validateSpec } from './validation';

/** Build a DAG PipelineSpec from React Flow nodes + edges. */
export function buildSpec(
  nodes: PipelineNode[],
  edges: Edge[],
  metadata: { name: string; tenantId: string },
): PipelineSpec {
  const nodeSpecs: NodeSpec[] = nodes.map((n) => {
    const spec: NodeSpec = { id: n.id, kind: n.data.nodeType, plugin: n.data.plugin };
    if (n.data.config && Object.keys(n.data.config).length > 0) spec.config = n.data.config;
    return spec;
  });
  const edgeSpecs: EdgeSpec[] = edges.map((e) => ({ from: e.source, to: e.target }));
  return {
    apiVersion: 'planx.io/v4',
    kind: 'Pipeline',
    metadata: { ...metadata },
    spec: { nodes: nodeSpecs, edges: edgeSpecs },
  };
}

/** Reconstruct React Flow nodes + edges from a DAG PipelineSpec. */
export function fromSpec(spec: PipelineSpec): { nodes: PipelineNode[]; edges: Edge[] } {
  const nodes: PipelineNode[] = spec.spec.nodes.map((ns) => ({
    id: ns.id,
    type: 'pipelineNode',
    position: { x: 0, y: 0 }, // free-form; layout applied on load if desired
    data: {
      name: ns.id,
      plugin: ns.plugin,
      pluginLabel: ns.plugin,
      config: ns.config ?? {},
      nodeType: ns.kind as PluginType,
      isValid: true,
    },
  }));
  const edges: Edge[] = spec.spec.edges.map((e, i) => ({
    id: `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
  }));
  return { nodes, edges };
}

export { validateSpec };
// keep generateNodeName, isObjectEmpty unchanged
```

- [ ] **Step 2:** Create `src/lib/validation.ts` — TS mirror of V-001..V-020 (collect ALL errors, don't short-circuit — matches the old `validateSpec` UX):

```ts
import type { PipelineSpec, NodeKind } from '@/types/pipeline';
import type { ValidationResult } from '@/types/pipeline';

const NODE_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const KINDS: NodeKind[] = ['source', 'processor', 'sink'];

export function validateSpec(spec: PipelineSpec): ValidationResult {
  const errors: string[] = [];
  if (!spec.metadata.name?.trim()) errors.push('Pipeline name is required.');
  if (!spec.metadata.tenantId?.trim()) errors.push('Tenant ID is required.');
  if (spec.apiVersion !== 'planx.io/v4') errors.push(`apiVersion must be planx.io/v4.`);
  if (spec.kind !== 'Pipeline') errors.push(`kind must be Pipeline.`);
  if (spec.spec.nodes.length < 2) errors.push('Pipeline needs at least 2 nodes (1 source + 1 sink).');

  // node rules
  const seen = new Set<string>();
  let sources = 0, sinks = 0;
  const idSet = new Set(spec.spec.nodes.map((n) => n.id));
  for (const n of spec.spec.nodes) {
    if (seen.has(n.id)) errors.push(`Duplicate node id "${n.id}".`);
    seen.add(n.id);
    if (!NODE_ID_RE.test(n.id)) errors.push(`Invalid node id "${n.id}".`);
    if (!n.plugin?.trim()) errors.push(`Node "${n.id}": plugin is required.`);
    if (!KINDS.includes(n.kind)) errors.push(`Node "${n.id}": unknown kind "${n.kind}".`);
    if (n.kind === 'source') sources++;
    if (n.kind === 'sink') sinks++;
  }
  if (sources !== 1) errors.push(`Exactly 1 source required (got ${sources}).`);
  if (sinks !== 1) errors.push(`Exactly 1 sink required (got ${sinks}).`);

  // edge rules + degrees
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const n of spec.spec.nodes) { inDeg.set(n.id, 0); outDeg.set(n.id, 0); }
  const seenEdge = new Set<string>();
  for (const e of spec.spec.edges) {
    if (!idSet.has(e.from)) errors.push(`Edge ${e.from}->${e.to}: node "${e.from}" not found.`);
    if (!idSet.has(e.to)) errors.push(`Edge ${e.from}->${e.to}: node "${e.to}" not found.`);
    if (e.from === e.to) errors.push(`Self-loop on "${e.from}".`);
    const k = `${e.from}->${e.to}`;
    if (seenEdge.has(k)) errors.push(`Duplicate edge ${k}.`);
    seenEdge.add(k);
    if (idSet.has(e.to)) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    if (idSet.has(e.from)) outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
  }
  for (const n of spec.spec.nodes) {
    if (n.kind === 'source' && (inDeg.get(n.id) ?? 0) !== 0) errors.push(`Source "${n.id}" must have in-degree 0.`);
    if (n.kind === 'sink' && (outDeg.get(n.id) ?? 0) !== 0) errors.push(`Sink "${n.id}" must have out-degree 0.`);
    if (n.kind === 'processor' && ((inDeg.get(n.id) ?? 0) === 0 || (outDeg.get(n.id) ?? 0) === 0))
      errors.push(`Processor "${n.id}" must have in- and out-degree >= 1.`);
  }
  // cycle + reachability (V-018/V-019) — reuse helpers if extracted; minimal inline check:
  if (hasCycle(spec)) errors.push('Graph contains a cycle.');
  const reach = reachability(spec);
  if (reach) errors.push(reach);
  return { valid: errors.length === 0, errors };
}

// (hasCycle / reachability implementations — Kahn + BFS, same as engine validate_graph.go)
function hasCycle(spec: PipelineSpec): boolean { /* Kahn; return true if processed != node count */ }
function reachability(spec: PipelineSpec): string | null {
  /* forward BFS from source: all reachable? reverse from sink: all reach sink? return error string or null */
}
```

(Implement `hasCycle`/`reachability` per the engine's `validate_graph.go` logic — Kahn's algorithm + forward/reverse BFS. The implementer translates the Go to TS.)

- [ ] **Step 3:** Commit: `feat(lib): DAG buildSpec/fromSpec + TS validation V-001..V-020`

---

## Task 3: `lib/edges.ts` cleanup + rewrite `pipeline.test.ts`

**Files:** `src/lib/edges.ts`, `src/lib/pipeline.test.ts`

- [ ] **Step 1:** In `src/lib/edges.ts`, DELETE `computeEdges` and `computeLayout` (order-derived). Keep any edge style constants/helpers if used by the canvas. If the file becomes empty of exports, delete the file and remove its imports.

- [ ] **Step 2:** Rewrite `src/lib/pipeline.test.ts` for DAG: test `buildSpec` produces `{nodes, edges}` from RF nodes+edges; `fromSpec` round-trips; `validateSpec` catches a cycle, missing source, dangling edge, etc. Drop `computeLinearOrder`/`computeEdges`/`computeLayout` tests (deleted).

- [ ] **Step 3:** `npm test` — lib tests pass.

- [ ] **Step 4:** Commit: `refactor(lib): drop linear computeEdges/Layout; DAG tests`

---

## Task 4: Store — edges first-class + `onConnect` + undo/redo captures edges

**File:** `src/stores/usePipelineStore.ts`

**Read the current file first.** Key changes:

- [ ] **Step 1:** State: `edges: Edge[]` (from `@xyflow/react`) — user-authored, NOT derived. Remove `computeEdges`/`computeLayout` imports.

- [ ] **Step 2:** Snapshots (`_past`/`_future`) MUST capture `{ name, nodes, edges }` (currently only `{name, nodes}`) — otherwise undo/redo drops edges. Update `snapshot()` and restore.

- [ ] **Step 3:** Add actions:
  - `onConnect(connection): void` — add edge (ReactFlow `addEdge`), with live constraint check (reject if it creates a 2nd source-in-edge, sink-out-edge, self-loop, or duplicate). Use the kind from `node.data.nodeType`.
  - `onEdgesDelete(edgeIds: string[]): void` — remove edges.
  - `onNodesDelete(nodeIds: string[]): void` — remove nodes + their connected edges.
- [ ] **Step 4:** `addNode` — drop `_order` assignment; place node at a free position (e.g., offset from existing). Source/sink cardinality still enforced (only 1 each) at add time OR at validation.

- [ ] **Step 5:** Remove ALL `_order` references (resequencing loops, `data: {...n.data, _order: i}`).

- [ ] **Step 6:** The store's `recompute`/`syncEdges` calls to `computeEdges`/`computeLayout` are DELETED — edges are now in state directly.

- [ ] **Step 7:** `npm run build` + `npm test` — fix any remaining references. Commit: `feat(store): edges first-class + onConnect; drop _order`

**Note:** this is the riskiest task (undo/redo + edge lifecycle). Test thoroughly: add edge → undo → edge restored; delete node → connected edges gone.

---

## Task 5: Node handles per kind (`PipelineNode.tsx`)

**File:** `src/components/canvas/PipelineNode.tsx`

- [ ] **Step 1:** Render ReactFlow `<Handle>` based on `data.nodeType`:
  - source: only `TargetPosition`? NO — source has only an OUTPUT handle (right side / `Position.Right`, type="source"). NO input handle.
  - sink: only INPUT handle (left / `Position.Left`, type="target"). NO output.
  - processor: both (left input + right output).
- [ ] **Step 2:** This enforces connection constraints visually (can't draw into a source's non-existent input). Commit: `feat(canvas): node handles per kind (source/sink/processor)`

---

## Task 6: Canvas wiring (`PipelineCanvas.tsx`)

**File:** `src/components/canvas/PipelineCanvas.tsx`

- [ ] **Step 1:** Wire ReactFlow `onConnect={store.onConnect}`, `onEdgesDelete`, `onNodesDelete`. Edges come from `store.edges` (already passed via `edges={edges}`).

- [ ] **Step 2:** Nodes draggable (free-form) — ReactFlow default; ensure `nodesDraggable` not disabled.

- [ ] **Step 3:** Commit: `feat(canvas): user-authored edges via onConnect`

---

## Task 7: Preview — DAG YAML/JSON + Validation tab (`SpecPreview.tsx`)

**File:** `src/components/preview/SpecPreview.tsx`

- [ ] **Step 1:** YAML/JSON tabs now serialize the DAG `buildSpec(nodes, edges, metadata)` (was linear `buildSpec(nodes, metadata)` — signature changed in Task 2). Update the call site.

- [ ] **Step 2:** Add a **Validation** tab showing `validateSpec(spec).errors` (✓/✗ list). Already-present validate button can populate this.

- [ ] **Step 3:** Commit: `feat(preview): DAG YAML/JSON + Validation tab`

---

## Task 8: Run + status (`api/controlPlane.ts` + run UI)

**Files:** `src/api/controlPlane.ts`, run UI component (toolbar Run button)

- [ ] **Step 1:** `submitPipeline` already posts `PipelineSpec` (now DAG). Add `getExecution(id)` polling `GET /executions/{id}?tenantId=...` (verify the engine's `GetExecution` route params).

- [ ] **Step 2:** Run button → `submitPipeline(dagSpec)` → get executionId → poll `getExecution` → display `pending → running → succeeded/failed` + error.

- [ ] **Step 3:** Manual browser test: drag source+proc+sink, connect, configure, Run → see `succeeded` (against a running engine on `feat/dag-pipeline`). Commit: `feat(run): submit DAG + poll execution status`

---

## Self-Review (after writing)

- **Spec coverage:** §5 Designer Changes → Tasks 1-8 cover types, buildSpec/fromSpec, validation, edges, store, canvas, preview, run. ✓
- **Dependency:** Plan 1 (engine DAG) done — the engine accepts DAG specs. ✓
- **Type consistency:** `NodeSpec{id,kind,plugin,config}`, `EdgeSpec{from,to}` consistent across tasks 1,2,7,8. `PipelineNodeData.nodeType` = `NodeKind`. ✓
- **Risk:** Task 4 (store undo/redo + edge lifecycle) is the riskiest — flagged.

## Execution Handoff

Plan saved to `planx-designer/docs/superpowers/plans/2026-06-24-designer-dag-migration.md`. Tasks 1-3 have full code (contract layer); Tasks 4-8 are structured specs (implementer reads current files + applies the documented pattern). Execute via subagent-driven-development (Tasks 1-3 are mechanical; Task 4 needs care). After Plan 2: Plan 3 (per-node status, if still desired) or Alpha ship.

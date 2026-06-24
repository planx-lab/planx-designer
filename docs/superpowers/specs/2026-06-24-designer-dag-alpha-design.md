# Designer DAG Alpha — Design Spec

**Date:** 2026-06-24
**Status:** Approved (brainstormed)
**Scope:** Planx 4.0 Alpha — visual PipelineSpec editor, end-to-end

---

## 1. Goal

Make Planx 4.0 usable end-to-end: a user drags nodes onto a canvas, connects them
into a DAG, configures plugins, exports the PipelineSpec, submits it to the engine,
and sees the run result. This is the Alpha validation milestone.

The Designer is **not** a workflow/BPMN/Airflow editor. It is a visual editor for
the **DAG PipelineSpec v4** (ADR-001): input is user interaction, output is
`PipelineSpec`, nothing more.

---

## 2. Key Decisions (locked during brainstorm)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Spec format** | DAG (`nodes[]` + `edges[]`) | Aligns with frozen ADR-001 + the DAG Runtime built in Stage 5C. The user's linear spec examples were a regression; DAG wins. |
| **Tech stack** | Keep existing (CodeMirror + custom Tailwind components) | Alpha value is DAG migration + run status, not editor/UI-lib churn. No Monaco, no shadcn. |
| **Run status granularity** | Pipeline-level in this slice; per-node deferred | Per-node status needs runtime/store/api extension with its own design unknowns (infinite-source completion, merge-wait state). It is additive (ExecutionRecord + field), so deferring causes no rework. |
| **Slice scope** | Full DAG (incl. broadcast/merge/diamond), not just linear | The DAG data model is general; building it once avoids all rework. Only per-node status is deferred. |

---

## 3. Slice Scope

### In scope

- Designer builds/arbitrates a **DAG** (any topology: linear, broadcast, merge, diamond).
- Engine accepts a **DAG PipelineSpec** (`spec.go` migrates linear → DAG).
- Full validation **V-001..V-020** (both engine-authoritative and Designer-mirror TS).
- Run a real plugin pipeline from the Designer and show **pipeline-level** status.

### Deferred (later slices)

- Per-node status (`source✓ / proc✓ / sink✓`) — Slice 2.
- Import YAML, multi-pipeline management (New/Save), Deep Dark theme polish.

### Success criteria

1. Designer exports **DAG** YAML (`spec.nodes[]` + `spec.edges[]`), not linear.
2. Engine accepts the DAG spec; `bridgeToRuntimeModel` is a pass-through (no edge synthesis).
3. `source-hello → processor-passthrough → sink-stdout` submitted from the Designer runs for real and succeeds.
4. Designer shows pipeline-level status: `pending → running → succeeded/failed` (+ error on failure).
5. Broadcast/merge/diamond topologies are buildable on the canvas, exportable, and pass V-001..V-020.

---

## 4. Engine Changes (prerequisite foundation)

### Current chain (linear spec → fake DAG)

```
linear PipelineSpec {source, processors, sink}
  → resolver → RuntimePipelinePlan {Source, Processors[], Sink}      (linear)
  → bridgeToRuntimeModel → model.Pipeline {Nodes, Edges}             (synthesizes linear edges)
  → runDAG
```

`bridgeToRuntimeModel` synthesizes `Source→Proc[0]→…→Sink` edges — fan-out/merge
cannot be expressed because the spec has no edges field.

### Target chain (DAG end-to-end, no synthesis)

```
DAG PipelineSpec {nodes[], edges[]}
  → resolver → RuntimePipelinePlan {Nodes[], Edges[]}                 (DAG)
  → bridgeToRuntimeModel → model.Pipeline {Nodes, Edges}              (pass-through)
  → runDAG (unchanged)
```

### Changes

| File | Change | Frozen? |
|------|--------|---------|
| `spec/spec.go` | `PipelineInner{Source,Processors,Sink}` → `{Nodes []NodeSpec, Edges []EdgeSpec}`; `NodeSpec{id,kind,plugin,config}` | YES — frozen model (ADR-001 authorizes) |
| `plan/plan.go` | `RuntimePipelinePlan{Source,Processors,Sink}` → `{Nodes []RuntimeNode, Edges []*model.Edge}` | YES — frozen model |
| `resolver/resolver.go` | Iterate `spec.Nodes`; `plan.Edges` from `spec.Edges`; verify from/to reference existing nodes | no |
| `coordinator.go` `bridgeToRuntimeModel` | Delete edge-synthesis; pass plan.Nodes/Edges straight through | no |
| `ValidateDAG` (new) | Implement V-001..V-020 (cardinality, Kahn cycle, reachability, referential integrity) | no (rules frozen in `dag-validation.md`) |
| API `CreatePipelineRequest` | Unchanged (embeds spec, now DAG) | — |

### Untouched (Stage 5C preserved)

`model.Pipeline`/`Node`/`Edge`, `dag_executor.go`, `runDAG`, `RuntimeBatch`,
`MergeState`, `Runtime.Start`, bootstrap, `CloseSessions`.

### Test impact

- `spec_test.go`, `resolver_test.go`, coordinator/handler tests: rewritten linear → DAG.
- New: `ValidateDAG` unit tests (one per V-rule, TDD).
- Extend the Stage 5C-4 e2e harness to post a DAG spec through the API/coordinator path (not only direct `Runtime`).

---

## 5. Designer Changes

### Core inversion: `_order` is truth → `edges` are truth

| Aspect | Now (linear) | After (DAG) |
|--------|-------------|-------------|
| Topology source of truth | `node.data._order` | user-authored `edges` (first-class in store) |
| Edge creation | `computeEdges()` derives from `_order` | `onConnect` creates edges |
| Layout | `computeLayout()` vertical auto | free-form drag (ReactFlow native); initial placement only |
| Connection constraints | none | source: output-only handle; sink: input-only; processor: both; validated live on connect |

### Changes

| File | Change |
|------|--------|
| `types/pipeline.ts` | `PipelineSpec.spec` → `{nodes: NodeSpec[], edges: EdgeSpec[]}` |
| `types/node.ts` | drop `_order`; add `kind` |
| `lib/edges.ts` | delete `computeEdges`/`computeLayout` (order-derived); keep style helpers |
| `lib/pipeline.ts` | `buildSpec`/`fromSpec` → DAG (nodes from RF nodes, edges from RF edges); drop `_order` sort |
| `stores/usePipelineStore` | edges in state (not derived); add `onConnect` with constraint checks; remove `_order` resequencing; free-form positions |
| `components/canvas/PipelineNode.tsx` | handles per kind (source right-only, sink left-only, processor both) |
| `components/canvas/PipelineCanvas.tsx` | wire `onConnect`/`onEdgesDelete`; live validation on connect |
| `lib/validation.ts` (new) | TS mirror of V-001..V-020 |
| `components/preview/` | YAML/JSON read DAG spec; new **Validation** tab |
| `api/controlPlane.ts` | `submitPipeline` unchanged (posts DAG spec); new `getExecution(id)` polling |

### Run + status (pipeline-level, this slice)

```
Run Pipeline
  → submitPipeline(DAG spec)            // POST /pipelines
  → executionId
  → poll getExecution(id)               // GET /executions/{id}
  → show pending → running → succeeded/failed (+ error)
```

### Untouched

Tech stack (CodeMirror, custom components, Tailwind), Config Panel, Palette (`GET /plugins`).

---

## 6. Contract: DAG PipelineSpec (single source of truth)

Engine `spec.go` and Designer `types/pipeline.ts` + `buildSpec` both implement this
shape (from `dag-spec.md`, frozen):

```yaml
apiVersion: planx.io/v4
kind: Pipeline
metadata:
  name: my-pipeline
  tenantId: tenant-01
spec:
  nodes:
    - { id: src,  kind: source,    plugin: source-hello,         config: { message: hi } }
    - { id: proc, kind: processor, plugin: processor-passthrough }
    - { id: snk,  kind: sink,      plugin: sink-stdout }
  edges:
    - { from: src,  to: proc }
    - { from: proc, to: snk }
```

---

## 7. Testing

| Layer | What | How |
|-------|------|-----|
| Engine `ValidateDAG` | V-001..V-020, one test each | TDD, Go unit tests |
| Engine spec/resolver/bridge | DAG serialize + parse + pass-through | rewrite linear tests → DAG |
| Engine e2e | DAG spec → coordinator → runDAG → real plugin | extend Stage 5C-4 harness (+ API path) |
| Designer buildSpec/fromSpec | DAG construct/reconstruct | vitest (existing) |
| Designer validation | TS V-001..V-020 | vitest |
| Designer store | `onConnect` constraints (reject cycle, illegal kind) | vitest |
| Designer↔Engine integration | browser: drag chain → POST → status | browser test (webapp-testing/chrome-devtools) |

---

## 8. Implementation Order

Each step is independently verifiable.

1. **Engine DAG contract** (foundation)
   - `spec.go` + `plan.go` → DAG (frozen model)
   - `ValidateDAG` V-001..V-020 (TDD)
   - resolver + bridge pass-through
   - rewrite linear tests → DAG
   - *verify*: Go unit tests green + e2e (DAG spec via API runs real plugin)
2. **Designer DAG migration**
   - types + `buildSpec`/`fromSpec` → DAG
   - store: edges first-class + `onConnect` constraints + drop `_order`
   - canvas: free drag + user edges + handle constraints
   - `validation.ts` (V-001..V-020 TS) + Validation tab
   - *verify*: vitest green + browser drag → export YAML is nodes/edges
3. **Run + status wiring**
   - `submitPipeline` (exists) + `getExecution` polling
   - status UI (pending→running→succeeded/failed)
   - *verify*: browser POST → real plugin runs → status shows succeeded

---

## 9. Non-Goals (this slice)

Retry, timeout, split/aggregate processors, dynamic DAG, workflow engine,
Marketplace, Metrics backend, ParentID lineage, Replay, per-node status,
Import YAML, multi-pipeline management, AI/chat pipeline generation.

# AI Rules — planx-designer (MANDATORY)

## PLANX-DESIGNER-GUARDRAIL

### ROLE

You are a **UI designer only**.

You are NOT a runtime architect.
You are NOT a protocol designer.
You are NOT a DAG designer.

### MUST FOLLOW

1. `planx-spec/planx-spec.md` — PipelineSpec v4 contract
2. `repo.lock` — Repository structure
3. `AI.md` — This file

### CAN MODIFY

- Layout, theme, spacing, icons, typography
- Form UX, dark mode, responsive behavior
- Component styling and visual hierarchy

### MUST NEVER MODIFY

- PipelineSpec structure or fields
- RuntimeExecutor
- Resolver
- Plugin Protocol
- Tenant Model / Project Model
- Session / gRPC / DAG / Edge / Scheduler

### CURRENT LIMITATION

Designer supports **linear pipelines only**:

```
Source → Processor[] → Sink
```

- Branching is FORBIDDEN.
- Merging is FORBIDDEN.
- Parallelism is FORBIDDEN.

**If UI ideas conflict with Spec, Spec always wins.**

---

## Authority Documents

Before working here, read:
1. `docs/architecture.md` — Architecture truth
2. `repo.lock` — Structural authority
3. `planx-spec/planx-spec.md` (workspace root) — PipelineSpec v4

## Hard Constraints

1. Pipeline topology is ALWAYS linear: Source → Processor[] → Sink.
2. Config is opaque JSON. Never interpret or validate config contents.
3. Plugin palette must be dynamically fetched from the API. Never hardcode plugin names or config shapes.
4. Edge connections in React Flow are derived from node ordering. Never allow manual edge editing.
5. The designer talks ONLY to the Control Plane API over HTTP. Never import Go modules from the workspace.
6. Every node add/reorder/remove must call `computeEdges()` to sync edges.
7. The spec is serialized as PipelineSpec v4 (YAML preferred). Never inject runtime fields (paths, session IDs, gRPC addresses).

## Tech Stack (FROZEN)

React 19 + TypeScript + Vite 7 + TailwindCSS v4 + shadcn/ui + Zustand + React Flow (XYFlow) + CodeMirror 6 + Lucide Icons

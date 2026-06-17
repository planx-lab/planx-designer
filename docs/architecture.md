# Planx Designer — Architecture

## 0. Purpose

Planx Designer is the **official visual Pipeline Designer** for Planx 4.0. It produces PipelineSpec v4 documents (YAML/JSON) and submits them to the Control Plane API. It does **NOT** execute pipelines.

## 1. System Boundary

```
PipelineSpec v4 (planx-spec)
        ↓
  Visual Editor (this repo)
        ↓
  YAML / JSON Preview
        ↓
  POST /pipelines
        ↓
  Control Plane API (planx-engine)
```

## 2. Architecture Principles

1. **Spec-First** — The PipelineSpec v4 is the single source of truth. The canvas is a visual representation, not the authority.
2. **Linear Only** — Source → Processor[] → Sink. No DAG, no branching, no fan-in/out.
3. **Edges Are Derived** — React Flow edges are computed from node order. Users never draw edges.
4. **Config Is Opaque** — Plugin config is free-form JSON. No schema interpretation.

## 3. Component Architecture

### Three-Column Layout

```
+--------------+--------------------------+----------------+
|   Palette    |        Canvas            |  Config Panel  |
|   (280px)    |       (flex-1)           |    (384px)     |
|              |                          |                |
|  [Sources]   |   [Source]               |  Node: src-1   |
|  [Processor] |      ↓                   |  Plugin: [...] |
|  [Sinks]     |   [Processor]            |                |
|              |      ↓                   |  Config (JSON):|
|  Search +    |   [Sink]                 |  {             |
|  Filter      |                          |    ...         |
|              |                          |  }             |
+--------------+--------------------------+----------------+
|                     Toolbar                              |
+----------------------------------------------------------+
```

### Data Flow

```
usePaletteStore.fetchPlugins()
  → GET /plugins → plugins map

usePipelineStore.addNode(type, plugin)
  → creates PipelineNode → computeLayout() → computeEdges()
  → React Flow re-renders

usePipelineStore.toSpec()
  → buildSpec() → PipelineSpec v4

usePipelineStore.toYaml()
  → buildSpec() → YAML serializer
```

## 4. State Management

Three Zustand stores:

| Store | Responsibility | Key State |
|-------|---------------|-----------|
| `usePipelineStore` | Pipeline nodes, edges, metadata, serialization | nodes, edges, name, tenantId |
| `usePaletteStore` | Plugin catalog from API | plugins, loading, error |
| `useUIStore` | Selection, preview, submit state | selectedNodeId, showPreview, submitStatus |

## 5. Linear Enforcement

1. **Store**: `addNode('source', ...)` replaces existing source. Same for sink.
2. **Validation**: `validateSpec()` checks exactly one source + one sink before submit.
3. **UI**: No edge handles exposed. `PipelineNode` only shows delete button on processors.

## 6. Plugin Discovery

`GET /plugins` returns `Record<string, PluginDescriptor>`. The palette groups by `type` (source/processor/sink). No plugin names are hardcoded.

## 7. Config Editor

CodeMirror 6 JSON editor with syntax highlighting and lint. Two-way binding: external state changes sync into the editor, editor changes push parsed JSON back to the store.

## 8. Spec Serialization

- **YAML**: Custom lightweight serializer (no js-yaml dependency) — suitable for PipelineSpec's flat structure.
- **JSON**: `JSON.stringify(buildSpec())`.

## 9. Future Compatibility

The internal node model preserves `id`, `kind`, `plugin`, `config`, and `position`. Edges exist internally as optional structures. When DAG support is added:
- `computeEdges()` can switch from linear derivation to DAG-aware logic
- `isValidConnection` can be enabled
- The Spec Preview and Submit flow remains unchanged (PipelineSpec v4 is the contract)

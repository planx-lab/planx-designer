# Plan 5 Browser E2E Test Plan

## Scope

Verify Plan 5's data-model migration from end-user perspective:
all user-facing features work correctly against the new protocol types.

## Prerequisites

- `planx-engine` running on `localhost:8080` with 3 example plugins built (`PLANX_PLUGIN_DIR=../`)
- `planx-designer` dev server on `localhost:5173`
- Playwright installed (`npx playwright install chromium`)

## Test Cases

### 1. Palette — plugin fetch and component display

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1.1 | Palette loads components from engine | Open designer, wait for palette | Source/Processor/Sink tabs visible; at least 1 component card per tab |
| 1.2 | Components grouped by kind | Click each tab | Source tab shows source components only; Processor tab shows processor components only |
| 1.3 | Component card shows plugin badge | Inspect a component card | Card shows component name + owning plugin name badge |
| 1.4 | Multi-component plugin in multiple tabs | Look for mysql-like multi-component plugin (if available) | Plugin with source+sink appears in both Source and Sink tabs |
| 1.5 | Search/filter | Type in search box | Card list filtered by component name |
| 1.6 | Empty state | Delete all plugins OR point to empty dir | "No components found" shown |

### 2. Canvas — node creation with new data model

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 2.1 | Click to add source | Click source component card | Source node appears on canvas with plugin display label |
| 2.2 | Click to add processor | Click processor card | Processor node added |
| 2.3 | Click to add sink | Click sink card | Sink node added |
| 2.4 | Source uniqueness | Click another source card | Old source replaced (only 1 source allowed) |
| 2.5 | Node label shows pluginLabel | Inspect node on canvas | Node displays `pluginLabel`, falls back to `pluginId` |

### 3. ConfigPanel — component picker

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 3.1 | Select node opens config | Click a canvas node | ConfigPanel opens with node name and Component dropdown |
| 3.2 | Component picker shows right kind | With source node selected | Dropdown only shows source components |
| 3.3 | Component picker options | Inspect `<select>` options | Each shows `pluginDisplayName / componentDisplayName` format |
| 3.4 | Change component | Select a different component | Node updates, spec rebuilds with new componentId |
| 3.5 | JSON editor works | Type valid JSON in config | Config stored, spec updated |
| 3.6 | Invalid JSON handled | Type `{invalid` | Lint error shown, bad state not pushed |

### 4. Spec preview — YAML includes new fields

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 4.1 | YAML preview shows plugin_id + component_id | Open preview tab | Each node has `plugin_id:` and `component_id:` fields |
| 4.2 | YAML copiable | Click copy button | Text copied, no errors |

### 5. Submit + validation

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 5.1 | Validation rejects missing component_id | Submit without setting component_id on a node | Error: "component_id is required" |
| 5.2 | Valid spec submits | Configure proper plugin_id+component_id on all nodes | Submit succeeds, returns executionId |
| 5.3 | Status polling works | After submit, observe toolbar | Status updates from pending → running → succeeded |
| 5.4 | Per-node status displayed | Wait for execution to run | Source/sink show "completed" |

### 6. Regression — features unchanged by migration

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 6.1 | Keyboard: Delete processor | Select processor, press Delete | Processor removed |
| 6.2 | Keyboard: Escape | Select node, press Esc | Selection cleared |
| 6.3 | Undo/Redo | Add node, Ctrl+Z, Ctrl+Shift+Z | Node removed, then restored |
| 6.4 | Panel collapse | Click collapse button | Palette/config panels collapse/expand |

## Implementation

- Framework: Playwright (chromium)
- Test file: `e2e/plan5-migration.spec.ts`
- Config: `playwright.config.ts` (webServer for dev mode)
- Run: `npx playwright test`

## Pass Criteria

All 24 test cases PASS. `tsc --noEmit` zero. `npm test` 27/27.

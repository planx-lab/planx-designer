# UI/UX Audit & Optimization — 2026-08-18

**Scope:** planx-designer (unified UI, BUILD + OPERATE) with two supporting fixes in
planx-engine's API. `planx-admin` is archived/deprecated and was audited read-only —
no changes there.

**Method:** code audit against the authority docs (`unified-ui-design.md` §4,
`user-scenario-analysis.md`), live visual audit (engine + 4 plugins running locally,
15 annotated screenshots, desktop 1440px + mobile 390px), and interaction testing
(Playwright, including a11y-tree inspection and pointer-interception checks).

---

## Findings → fixes

### P0 — Correctness / blocking usability

| # | Finding | Fix |
|---|---------|-----|
| 1 | **Mobile hamburger unclickable.** Palette/config panels use `max-md:absolute` but no ancestor established a positioning context, so they anchored to the *viewport* and covered the app header (proven by Playwright pointer-interception log). | `DesignerView.tsx`: panels' flex row is now `relative`; overlays anchor below the toolbar, `shadow-2xl` for drawer affordance. Verified: hamburger clicks without force. |
| 2 | **Pipelines table lied.** `GET /api/pipelines` never populated `lastStatus`/`executionCount` (spec store only), so every row showed "—" and "0 executions" forever. | Engine `handler.go`: `ListPipelines` enriches each summary from the execution store (`ListByPipeline`); `PipelineSummary.ExecutionCount` added (removed the duplicate field on `PipelineDetailResponse`). UI now shows real badges + counts. |
| 3 | **Pipelines drill-down filtered client-side** against the *global* first page (5 rows): wrong "No executions" for pipelines whose runs are older; fetch errors swallowed as "No executions"; no request-sequencing guard. | Engine `GET /executions` now accepts `pipelineId` (server-side filter + pagination). `PipelinesPage` uses it, renders load/error/empty distinctly, and guards stale responses with a sequence token. |
| 4 | **Dashboard Health card false alarm.** `health.data?.status === 'ok' ? 'OK' : 'DEGRADED'` rendered red DEGRADED during every initial load; DEGRADED also used destructive-red, conflicting with the top-bar amber convention. | Four distinct states: loading `—` (neutral), offline `OFFLINE` (red), degraded `DEGRADED` (amber), ok `OK` (green). |
| 5 | **"Invalid Date" risk.** Unguarded `new Date(...).toLocaleString()` across tables. | `lib/display.ts`: `formatDateTime` / `formatRelativeTime` with invalid-input guards (`—`); unit-tested; all tables migrated. |

### P1 — Operation logic (design-contract gaps, unified-ui-design.md §4.3/§4.4)

| # | Finding | Fix |
|---|---------|-----|
| 6 | **Executions rows were inert** — Flow B ("click row → node-status timeline + errors") not implemented. | Rows expand (click/Enter/Space, `aria-expanded`): per-node status chips, full error text in a mono error box, execution id. |
| 7 | **Empty states dead-ended** — bare "No executions yet". | Shared `EmptyState` (icon + headline + hint + action link): Executions/Pipelines point to Designer; Plugins explains the plugin dir; status-filtered empty explains the filter. |
| 8 | **Spinner-in-table loads**; contract mandates skeletons. | Shared `TableSkeleton` rows for Executions/Pipelines/Dashboard tables. |
| 9 | **Errors not retryable** — bare "Failed to load X." on 3 pages. | Shared `ErrorState` with Retry wired to `refetch()`. |
| 10 | **RUNNING badge used warning-amber**, conflicting with the token semantics (`--color-info` is documented "RUNNING / in-flight"; warning is degraded). | Shared `StatusBadge` (one implementation, replaces 3 divergent copies) uses `info` for RUNNING; PENDING gets a clock icon; unknown statuses render text without implying a state. |
| 11 | **Submit disabled with no explanation.** | Title tooltip: "Add at least a source and a sink to submit". |

### P2 — Visual polish / orientation

| # | Finding | Fix |
|---|---------|-----|
| 12 | **No page orientation** — topbar center empty; `document.title` static. | Topbar shows the current view title (`font-heading`); `document.title` syncs (`Executions · Planx`). |
| 13 | **Scaffold favicon** (purple Vite "Z") off-brand. | Brand favicon: dark tile + accent-green x (matches the "Planx **x**" wordmark). |
| 14 | **Loading health showed red "—"** in the top bar. | Neutral "…" checking state; red reserved for confirmed offline. |
| 15 | **Low-contrast text** flagged across empty states/labels (some ≈2.7:1, below AA). | Bumped: sidebar group labels /40→/50, canvas empty state /50,/40→/60,/50, palette empty /30→/50, dashboard timestamps /40→/50. |
| 16 | **`text-white` on accent buttons** (Validate Config, Discover) broke the token system; missing focus rings. | `text-accent-foreground` + `focus-visible:ring`. |
| 17 | **Dashboard "Recent Executions" was a dead slice** (top-10, no exit). | "View all →" link bridges to the Executions page. |
| 18 | **Numeric columns shifted** as values changed; contract mandates mono/tabular numerals. | IDs/counts/timestamps now `font-mono tabular-nums` on all Operate tables. |
| 19 | Dead code / contrast nits: `canDelete = true`, barely-visible node handles. | Removed; handles use `foreground-muted`. |

## Files changed

**planx-engine** (2 files): `internal/api/handler.go` (ListPipelines enrichment;
executions `pipelineId` filter), `internal/api/types.go` (ExecutionCount on
PipelineSummary). Tests: `go test ./...` — 8 packages ok.

**planx-designer** (14 files + 2 new): new `components/admin/StatusBadge.tsx`,
`components/admin/FeedbackStates.tsx` (EmptyState/ErrorState/TableSkeleton);
rewrote `ExecutionsPage.tsx`, `PipelinesPage.tsx`; updated `Dashboard.tsx`,
`PluginsPage.tsx`, `App.tsx`, `DesignerView.tsx`, `PipelineToolbar.tsx`,
`ConfigPanel.tsx`, `SchemaForm.tsx`, `StatusIndicator.tsx`, `PipelineNode.tsx`,
`PluginPalette.tsx`, `api/engine.ts`, `types/admin.ts`, `lib/display.ts`(+tests),
`public/favicon.svg`. Tests: 102/102; `npm run build` green; eslint delta zero.

## Verification

- Engine: `go test ./...` green; live `curl` shows `lastStatus`/`executionCount`
  populated and `pipelineId` filter working.
- Designer: vitest 102/102, production build, eslint identical to baseline.
- Playwright tour (desktop + mobile): health card OK, View-all link, expandable
  execution detail with node chips, real pipeline badges/counts, mobile hamburger
  clickable without force, zero console/page errors.

## Deliberately not done (candidates for a later round)

- **Live per-node validation badges** (contract §4.3 Flow A) — needs validation
  results keyed by node in the store; the current Validate flow stays manual.
- **Light mode** (contract §4.4 parity) — large theming effort, deferred.
- **Chart pause/resume** (§4.3 Flow B) — low value at current data volumes.
- **Replace `window.confirm`** (New/Delete) with themed dialogs.
- **planx-admin repo** — archived; audit findings recorded in conversation only.

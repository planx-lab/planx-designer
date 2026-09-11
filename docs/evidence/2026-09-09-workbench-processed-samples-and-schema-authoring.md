# Workbench processed samples and typed schema authoring

Date: 2026-09-09. Scope: Designer source, tests, and this new evidence document.
This is frontend integration evidence, not database or full pipeline acceptance.

## Result

The right evidence area keeps source sampling separate and adds an explicit
processed-sample action for the selected processor or sink. The request uses the
existing `POST /api/plugins/preview` endpoint and sends ordered
`processors: [{ pluginId, componentId, config }]` resolved from actual edges.
Rail order and canvas positions do not determine processing order.

Source sampling requires the advertised safe preview hook. Processor identities
must be confirmed builtin catalog components. Missing nodes, missing edges,
duplicate identities, branches, merges, cycles, unsupported origins, and unknown
components are rejected without silently treating the path as direct-source.
The backend remains authoritative about actual supported processor behavior.
The confirmed backend limit of eight processors is also enforced by both the
frontend path resolver and preview API boundary before network dispatch.

Processed responses require `scope: "processed"`, bounded integer `inputRows`,
the requested `processorCount`, a typed batch, and a truncation flag. An old
source-only response cannot become processed evidence. Input rows, output rows,
and processor count are displayed. Zero output preserves the actual returned
schema and describes only the bounded sample; it does not establish an empty
source or a successful full pipeline.

Preview UI limits are 1-100 rows and 1-1048576 response bytes, with defaults of
20 and 65536. Both preview and compatibility have a 10-second client timeout,
explicit cancellation, abort signals, and late-response guards. The legacy
source API's zero-as-server-default behavior remains for existing consumers;
the UI and processed requests require positive explicit budgets.

Workbench target compatibility uses the actual current output Schema from the
selected sink's unique upstream path. Source Schema is accepted only for a
real direct source-to-sink edge. Compatibility remains a separate explicit
button and reports static schema compatibility with runtime validation still
required. No automatic compatibility/database request is made after sampling.
The workbench's editable config keeps its connection probe; target schema
checking is located next to the actual evidence. Legacy ConfigPanel JSON
compatibility behavior remains available outside this workbench integration.

Configuration, tenant, node selection, edge, component identity, catalog version,
and observed resource-version changes invalidate relevant evidence and abort
pending actions. Source evidence remains anchored to its source across ordinary
selection and display-mode changes. Both existing editor error attributes
(`data-config-invalid` and `data-config-draft-invalid`) prevent preview and
compatibility dispatch and invalidate old results. Restarting, cancelling, or
failing processing removes prior target compatibility conclusions.

Typed schema and record values use existing lossless JSON handling. Decimal
coefficients, int64 text, civil time, absolute timestamps, omitted precision,
explicit timePrecision 0, NULL, missing, and empty strings are not normalized.
No lineage between the two independent source reads is asserted.

## Additional source-schema authoring

Only the workbench opts into the public `record.Schema` form for a catalog
OBJECT field named `schema`. The existing structured array widget now supports
nested declared arrays; local synthetic metadata supplies field name, kind,
nullable, Decimal precision/scale, timePrecision, recursive struct fields and
list elements. Unknown properties and exact literals are preserved. Advanced
JSON remains available, unsupported shapes remain in JSON, and invalid numeric
drafts cannot be discarded by switching modes. Opening a form does not create
or infer a schema. Component-specific semantic validation still uses the
explicit existing Validate Config action.

## Run gate

Run availability now uses the existing spec validator with subscriptions to
current nodes and edges. Missing Source/Sink, disconnected required nodes and
other current spec errors disable Run with visible reasons. Valid required-sink
fan-out remains runnable. Existing execution-record navigation, confirmation,
cancel/Escape behavior and focus restoration remain covered by the retained
tests. No desktop draft, node configuration, saved task, or UI mode was changed
through browser interaction in this frontend task.

## Verification

New workbench and Run tests first reproduced the missing actions and enabled
invalid Run button: 38 failed, 1 passed. New schema-authoring tests first
reproduced the absent structured controls: 4 failed, 1 passed.

Final commands:

```sh
npm --prefix planx-designer test -- --reporter=dot
npm --prefix planx-designer run build
```

Earlier test invocations set `DEBUG_PRINT_LIMIT` only to bound failure diagnostic
output; the final full suite ran with the exact command above. Result:
**297 tests passed in 35 files**, including all prior 249 tests and 48 additional
cases. Final suite duration: 4.52 seconds.
TypeScript project build and Vite production build both passed. Vite reported
large chunks above 500 kB; no dependency or bundle redesign was attempted.
Build ran after the main task explicitly provided an idle browser window.

Added coverage includes actual edge ordering with scrambled node/edge arrays,
exact numeric config and returned values, output-schema compatibility, direct
source eligibility, unsupported graphs, tenant/selection/config/identity/version
cancellation, late responses, observed resource refresh/save invalidation,
compatibility cancellation on version changes, zero filtered output, safe errors,
source-only response rejection, client timeout, invalid drafts and limits,
mode/config preservation, Run structural gates, and recursive schema authoring.
The backend contract follow-up adds acceptance of exactly eight processors,
rejection of nine at the UI/API boundaries, and safe handling of HTTP 400
`invalid_config` with previous sample and green compatibility state removed.

## Changed paths

- `src/api/connections.ts`
- `src/api/pluginOperations.ts`
- `src/api/pluginPreview.ts`
- `src/api/pluginPreview.processed.test.ts`
- `src/components/DesignerWorkbench.tsx`
- `src/components/DesignerWorkbench.processed.test.tsx`
- `src/components/editor/ConfigPanel.tsx`
- `src/components/editor/PluginOperationsPanel.tsx`
- `src/components/editor/SourcePreviewPanel.tsx`
- `src/components/editor/WorkbenchPreviewPanel.tsx`
- `src/components/editor/SchemaForm.tsx`
- `src/components/editor/SchemaForm.record-schema.test.tsx`
- `src/components/editor/StructuredArrayField.tsx`
- `src/components/toolbar/PipelineToolbar.tsx`
- `src/components/toolbar/PipelineToolbar.structure.test.tsx`
- `src/hooks/useConfigDraftGuard.ts`
- `src/lib/previewPath.ts`
- `src/stores/useConnectionRevisionStore.ts`
- `docs/evidence/2026-09-09-workbench-processed-samples-and-schema-authoring.md`

No Git commands, pushes, backend changes, canonical documentation edits, logo
changes, stylesheet changes, service restarts, or repository restructuring were
performed. Existing Mapping/Lookup forms and sage/cream/green styling remain.

## Acceptance boundary and remaining limitations

The tests mock HTTP responses at the fetch boundary and exercise the real
Designer components, state, request serialization and UI actions. They do not
prove backend Runtime execution, real connector compatibility, delivery,
source ACK/checkpoint behavior, or absence of target writes on a real server.
Those remain the main/backend task's acceptance responsibility.

Resource changes are invalidated when tenant metadata is observed by the
existing resource-read API or successfully saved. The fixed preview response
does not carry resource versions; there is no new background polling or
cross-client push mechanism. A remotely changed version not yet observed by
this client cannot be detected automatically. Refresh resources and resample
after external resource changes.

The main task's planned isolated fixture is SQL Server
`reference.source_records`, exact negation mapping, PostgreSQL dimension Lookup,
required-field validation, filtering `record.record_id != 44`, and a unique
PostgreSQL upsert target. Expected acceptance is 8 input rows, 7 output rows and
4 processors in tenant `workbench-final-Q76jPR`, with source/dimension/target
connections at version 1. That real acceptance was not run or claimed here.
The main task owns fixture environment, Engine replacement, visible-UI import,
desktop-draft export, actual execution and packaging.

In the subsequent handoff, the main task reported the updated backend live on
8080 via the 18083 proxy, Ready health, and a real processed request returning
8 input rows / 7 output rows / 4 processors / 10 fields, with record_id 44
filtered. It also reported unchanged target rows, execution list, and SQLite
database/WAL. These are main-task-reported backend observations, not independent
checks performed by this frontend task. Browser acceptance can proceed with the
final passing frontend test/build artifacts; this task has not touched the
desktop draft or run the real pipeline.

## New discard confirmation repair follow-up

The main browser task reported that clicking `Start a new pipeline` on the
two-processor draft blocked the embedded browser's CDP mouse dispatch for
approximately 14 seconds. The toolbar's legacy synchronous `window.confirm`
was the failing boundary. The preserved visible YAML and dismissal of the
already-open native dialog remain owned by the main task.

Added a dedicated React discard dialog using the existing Run confirmation's
UI mechanics, with independent discard wording. Cancel receives initial focus;
Tab and Shift+Tab stay within the two actions. Escape, Cancel and backdrop
clicks preserve graph/config, pipeline identity, undo/redo history, UI modes and
browser draft. Background elements are inert during the decision, their prior
inert states are restored, and focus returns to the trigger. Duplicate open
requests do not create a second dialog.

Only explicit `Discard and New` consent invokes the toolbar's existing local
draft clear and store reset. Nodes, edges, name, pipeline identity and history
reset locally; the current tenant is retained exactly, including an empty
tenant instead of silently substituting a default. Saved server tasks and
unrelated browser storage remain untouched. The action sends no HTTP request
and creates no persisted task or execution. Empty-canvas New retains its prior
no-confirmation behavior. RunConfirmation itself was not changed.

Regression first reproduced the native call: **9 failed, 1 passed**. After the
repair, the exact full command `npm --prefix planx-designer test -- --reporter=dot`
passed **307/307 tests in 36 files**, duration 5.05 seconds. This includes every
prior 297 test and ten new discard cases. `npm --prefix planx-designer run build`
passed TypeScript and Vite; only the existing large-chunk warning remains.
These counts supersede the earlier frontend handoff counts above.

This repair touched only:

- `src/components/toolbar/PipelineToolbar.tsx`
- `src/components/toolbar/DiscardConfirmation.tsx` (new)
- `src/components/toolbar/DiscardConfirmation.test.tsx` (new)
- This appended evidence section.

No browser operation, native-dialog dismissal, service restart, backend change,
or Git command was performed by the frontend repair. The built UI is ready for
the main task to resume browser acceptance after dismissing the old native
dialog; that real-browser follow-up has not been claimed as verified here.

## Catalog metadata unavailable repair follow-up

The main task reported an expected initial catalog fetch failure after Engine
restart. The workbench preserved the mapping configuration and showed its
catalog warning, but ConfigPanel incorrectly treated a missing descriptor as
an empty configuration schema and displayed `No configuration needed` /
`This component runs as-is`, with an empty component selector.

ConfigPanel now reserves that empty-state conclusion for a known descriptor
with an explicitly empty ConfigSchema fields array. Missing descriptors or
omitted schemas show `Configuration schema unavailable`, preserve the selected
component identity in the selector, and direct the user to Component Catalog /
Retry or Raw JSON. Catalog recovery restores the structured form without
replacing stored node values or pipeline identity. No automatic catalog retry
or other network action was added.

Seven new targeted cases cover initial loading, failed catalog retrieval,
missing component metadata, an omitted schema, an explicitly empty schema,
exact Raw JSON access, and recovery of the structured Mapping form.
The final exact command `npm --prefix planx-designer test -- --reporter=dot`
passed **314/314 tests in 37 files**, duration 6.25 seconds, retaining all
previous 307 cases. `npm --prefix planx-designer run build` passed TypeScript
and Vite with only the existing large-chunk warning. These results supersede
the earlier verification counts.

This final repair touched only `src/components/editor/ConfigPanel.tsx`, new
`src/components/editor/ConfigPanel.metadata.test.tsx`, and this evidence append.
The frontend task did not access either live browser tab or the Codex app, and
did not modify the user's live draft. Frontend edits are now stopped so the
main task can retry the catalog and continue browser acceptance without further
source changes or HMR interruptions from this task.

## Nested Schema JSON draft guard repair

Independent review identified that the nested fields-array Advanced JSON
fallback marked invalid JSON only with `data-config-invalid`, while the outer
Schema form-to-JSON switch guards `data-config-draft-invalid`. The outer switch
could therefore unmount an invalid raw draft and permit preview against the
older accepted configuration. The focused regression reproduced removal of
that textarea before the fix.

The existing basic structured JSON input now additionally marks
`data-config-draft-invalid` when parsing fails and its text differs from the
accepted serialized value. This identifies an actual unapplied edit without
classifying merely unset required values as invalid drafts. The outer guard
itself remains unchanged.

The focused integration test establishes a source sample and green static
compatibility, opens nested fields JSON, enters an invalid draft, and attempts
the outer mode switch. It verifies the draft remains visible and unchanged,
accepted config is preserved, old compatibility is removed, preview and
compatibility stay disabled, and neither action dispatches another request.
A second test keeps JSON authoring available when required field values are
simply unset.

Final `npm --prefix planx-designer test -- --reporter=dot`: **316/316 tests in
38 files passed**, duration 5.21 seconds, including every prior 314 case.
`npm --prefix planx-designer run build` passed TypeScript and Vite, with only
the existing large-chunk warning. These are the latest verification results.

This repair changes one input attribute in
`src/components/editor/SchemaForm.tsx`, adds
`src/components/editor/SchemaForm.nested-draft.test.tsx`, and appends this
evidence. No browser or Codex-app access, Engine embedding/restart, backend
change, or Git operation was performed. Frontend changes are frozen again;
the main task owns embedding the completed build and real-browser acceptance.

# Workbench repair verification, 2026-09-09

## Verdict

IMPLEMENTED and VERIFIED for this repair scope: structured config entry, tenant-consistent execution progress, updated toolbar regressions, and cancellable run confirmation.

This follows the [original failed verification record](/Users/mw/workspace/repo/github.com/planx-lab/planx-designer/docs/evidence/2026-09-09-workbench-isolated-verification.md), which remains unchanged. This is not acceptance of the complete Builtin implementation matrix.

## Changes and causes

- Catalog normalization now retains protocol NUMBER (3), OBJECT (7), and ARRAY (8), nested properties, snake-case enum options, and scalar defaults. The previous Alpha-era map silently converted unrecognized numeric types to STRING. These types already exist in the canonical protocol; no new protocol or ADR was introduced.
- Structured fields use lossless JSON input and emit objects/arrays, not escaped strings. ARRAY columns no longer enter the legacy comma-separated STRING renderer. Invalid drafts remain visible, are not applied, and block run confirmation. Clearing an optional structured field removes it rather than fabricating a value.
- Execution details now use the same tenant source as the execution list. The old detail component used the separate Designer UI store. Regression tests deliberately give those sources different tenants. Execution-detail responses also adapt the Engine's actual `id` field without changing exact progress counters.
- The run entry now awaits an in-page confirmation dialog. Cancel, Escape and backdrop dismissal return false; only explicit confirmation allows dispatch. Focus starts on Cancel, stays inside the dialog, and returns to the trigger. Background controls are inert while the dialog is open. New-task create-and-run and saved-task run-in-place semantics remain unchanged.
- Existing toolbar tests retain identity, draft cleanup, polling uncertainty and failure assertions. They now perform the confirmation action and check current status/action labels. New tests cover cancellation, focus, blocking invalid drafts, tenant divergence, structured values and precision. No tests were removed.
- The native confirmation for discarding a draft with New was not changed. A protective edit check rejected a broad replacement because the toolbar had two native confirmations; the completed edit targets only the run-warning call.
- The approved palette and logo remain unchanged. No Engine runtime, execution database schema, canonical contract mirror, Git history or remote repository was modified.

## Test evidence

All commands ran from `/Users/mw/workspace/repo/github.com/planx-lab`.

```sh
npm --prefix planx-designer test -- --run \
  src/components/editor/SchemaForm.catalog.test.tsx \
  src/components/admin/ExecutionsPage.progress.test.tsx \
  src/components/admin/ExecutionProgressPanel.stats.test.tsx \
  src/components/toolbar/PipelineToolbar.test.tsx --reporter=dot
npm --prefix planx-designer run build
npm --prefix planx-designer test -- --reporter=dot
```

| Check | Actual result |
| --- | --- |
| Focused tests before implementation | 25 failed, 15 passed; exit 1. |
| Focused tests after type/tenant changes, before completed toolbar edit | 13 failed, 27 passed; exit 1. |
| Focused tests after dialog implementation | 1 failed, 39 passed; exit 1. The remaining old test clicked a saved button reference without confirming and still expected Submitted. |
| TypeScript and Vite build | Exit 0. Runtime source was complete; the last subsequent edit only adapted the remaining old test's confirmation/status assertions. |
| Final complete frontend suite | 30 files passed; 233 tests passed; exit 0. |

Build warnings remain: main JavaScript approximately 1,001.62 kB and JSON editor 512.60 kB before compression exceed Vite's 500 kB advisory. This pass does not claim a performance benchmark.

## Real UI and Engine evidence

The existing isolated Engine was reused at `127.0.0.1:8080`, with SQLite `/tmp/planx-workbench-check.5IlA0M/state.db` and authorized file root `/tmp/planx-workbench-check.5IlA0M/files`. Browser origin: http://localhost:18083/. Tenant: `workbench-verify-20260909`. No production credentials, external databases, target clearing or overwrite mode were used.

The actual detail endpoint is:

```sh
curl --max-time 5 -sS -i \
  'http://127.0.0.1:8080/api/executions/27c27351-d5f7-47e2-9503-15526da75b88?tenantId=workbench-verify-20260909'
```

It returned HTTP 200 with the full persisted progress. The earlier manual `/progress` probe was not the frontend's route and is not evidence of a backend progress-storage failure. After the tenant fix, the real details UI displayed commits, source acknowledgements, pending acknowledgements and InFlight separately for both executions.

| Status | Real interaction | Evidence |
| --- | --- | --- |
| VERIFIED | Guided CSV Source configuration | Selected the existing authorized file connection, entered `source.csv`, pasted an object RecordSchema into the guided schema field, explicitly set header=true and batch_rows=3. Backend configuration validation passed without switching to Raw JSON. |
| VERIFIED | Real source preview | Eight typed records returned, not truncated. Int64 values, decimal coefficient/exponent data, precision 38 / scale 18, timePrecision 6, NULL and empty strings remained distinct. |
| VERIFIED | Guided CSV Sink configuration | Entered the same schema and a new relative target `repaired-delivery.csv`; create/append/overwrite options were visible. Selected create, header=true, batch_rows=3 and validated config. |
| VERIFIED | Actual DAG | Added the builtin passthrough processor and dragged real ports to connect Source -> Processor -> Sink. No hidden store edits created the graph. |
| VERIFIED | New-task button cancellation | Opened the in-page run dialog and clicked Cancel. The draft and graph remained; focus returned to the run entry. |
| VERIFIED | Keyboard cancellation | Tab moved Cancel -> Confirm run; Shift+Tab returned to Cancel. Reopened and pressed Escape; focus returned to the run entry. |
| VERIFIED | Cancellation side effects | Before and after both cancellations: one pipeline, one execution, new target absent, original target hash unchanged. |
| VERIFIED | Explicit confirmation | A separate Confirm run click created exactly one new pipeline/execution and delivered the eight records. UI eventually showed Succeeded and completed node statuses. |
| VERIFIED | Saved-task cancellation | Reopening the saved task's run dialog warned that it would use the server-saved version, not unsaved edits. Cancelling left two pipelines and two executions total, with both output hashes unchanged. |
| VERIFIED | Progress display | The new execution's UI showed 8 committed rows, 3 acknowledged source deliveries, no unknown commits/ACKs and zero InFlight, matching SQLite. |

The structured input is a precise JSON editor inside the guided form, not a completed visual RecordSchema field-grid designer. Invalid draft/unknown type run blocking has automated coverage; an exhaustive real-browser invalid-input matrix was not run here.

## Cancellation and delivery reconciliation

New task: `workbench-repair-confirmation`.

Pipeline ID: `970808fb-1a25-44cd-9d93-47bce1698e51`.

Execution ID: `92e758b7-2d37-4e4c-b4a4-99b510841b3e`.

Actual chain:

```text
workbench-files/source.csv
  -> builtin csv/source, explicit typed schema, batch_rows=3
  -> builtin processors/passthrough
  -> builtin csv/sink, repaired-delivery.csv, write_mode=create
  -> source acknowledgement and separately reported InFlight release
```

Recorded status: SUCCEEDED, empty error. Created `2026-09-09 03:30:28.375882 UTC`, finished `2026-09-09 03:30:28.394848 UTC`.

| Persisted measurement | Value |
| --- | ---: |
| Source output rows | 8 |
| Processor input / output rows | 8 / 8 |
| Sink attempted / committed rows | 8 / 8 |
| Synced batches | 3 |
| Source deliveries / acknowledged deliveries | 3 / 3 |
| Pending / unknown source acknowledgements | 0 / 0 |
| ACK errors / unknown commits | 0 / 0 |
| InFlight batches / bytes | 0 / 0 |
| Cleanup errors | 0 |
| Output bytes | 739 |

The new target was read directly. It retained integers `9007199254740993` and `9223372036854775807`, decimal values `12345678901234567890.123456789012345678` and `0.000000000000000001`, microsecond timestamps, and separate empty strings and `\N` NULL markers. As in the baseline, CSV normalizes trailing decimal zeroes; this is not a lexical-scale round trip.

Both the old `delivered.csv` and new `repaired-delivery.csv` have SHA-256:

```text
1a8bbaa14a5f8a3a174809629acc96a07221492fead19d8c9fa7d8273503c933
```

Read-only measurements used SQLite queries plus `cat` and `shasum`; the target was not truncated or regenerated to pass a test.

```sh
sqlite3 -readonly -json /tmp/planx-workbench-check.5IlA0M/state.db \
  "SELECT (SELECT count(*) FROM executions WHERE tenant_id='workbench-verify-20260909') AS executions,(SELECT count(*) FROM pipelines WHERE tenant_id='workbench-verify-20260909') AS pipelines;"
cat /tmp/planx-workbench-check.5IlA0M/files/repaired-delivery.csv
shasum -a 256 /tmp/planx-workbench-check.5IlA0M/files/repaired-delivery.csv \
  /tmp/planx-workbench-check.5IlA0M/files/delivered.csv
```

All exited 0. The final count was two pipelines and two executions. Only the explicit confirmation added one of each. One browser automation command took 81.8 seconds at the tool layer; the Engine timestamps show about 19 ms of execution. No frontend or automation performance conclusion is inferred from that discrepancy.

## Remaining scope

UNVERIFIED: the full SQL Server -> Typed Records -> Mapping/CEL -> Lookup -> Validate/Filter -> PostgreSQL -> source confirmation scenario; restart/recovery and duplicate/failure injection; complete mobile/accessibility/input-state coverage; transformed-sample preview and a visual schema builder.

Other required connectors, targets, Arrow evaluation and the full approved Builtin matrix remain required. They are OUT OF SCOPE for this repair pass only, not removed from the project. A passing build, the 233 tests and this CSV fixture do not certify those scenarios.

Next implementation work should continue the processing-rule and transformed-sample workflow, then validate the approved database vertical slice in a real authorized environment. The isolated state and synthetic files remain available for reproduction; the browser is left on the new execution's expanded progress view.

# Workbench isolated verification, 2026-09-09

## Verdict and scope

Overall UI acceptance: BLOCKED. A real file delivery succeeded, but guided schema entry, execution-progress display, and the toolbar regression suite did not pass.

This pass verifies the previously implemented single workbench, not the entire Builtin implementation brief. The approved palette and logo remain unchanged. No repository source or test files were changed during this verification pass. This document is execution evidence, not a new architecture decision or a replacement for the canonical acceptance matrix.

## Isolation

- Frontend: http://localhost:18083/, separate browser origin from the owner's http://127.0.0.1:18083/ draft.
- Tenant: `workbench-verify-20260909`.
- Task: `workbench-isolated-csv`.
- Engine: `workbench-verification`, listening only on `127.0.0.1:8080`.
- Scratch directory: `/tmp/planx-workbench-check.5IlA0M`.
- SQLite: `/private/tmp/planx-workbench-check.5IlA0M/state.db`, newly created; startup reconciled zero interrupted executions.
- File connection: `workbench-files`, driver `file`, referencing `PLANX_WORKBENCH_FILES`.
- Authorized file root: `/tmp/planx-workbench-check.5IlA0M/files`.
- Engine inherited no application credentials. External plugin discovery pointed to a nonexistent scratch directory.
- The temporary Go build overlay changed only the server listen address to loopback. Repository Engine source was untouched.
- No production services, sensitive fixtures, target truncation, execution retry, Git operations, remote publication, or remote repository administration were used.
- This pass does not establish repository synchronization or a clean Git worktree.

## Commands and results

Commands below ran from the workspace root unless a `cd` is shown.

```sh
(cd planx-designer && npm run build)
npm --prefix planx-designer test -- --reporter=dot
```

Build: exit 0, TypeScript and Vite completed. Vite warned about chunks larger than 500 kB: main JavaScript about 996.75 kB, JSON editor about 512.60 kB before compression.

Tests: exit 1; 209 passed, 8 failed, 217 total. Test files: 28 passed, 1 failed. The failures are in `planx-designer/src/components/toolbar/PipelineToolbar.test.tsx`. Reported failures search for the old `/submit/i` button name after the toolbar gained a run-confirmation entry. This is not proof that updating selectors alone will cover the new behavior. No tests were deleted, changed, or rerun to hide the failures.

```sh
cd planx-engine
go build -overlay /tmp/planx-workbench-check.5IlA0M/overlay.json \
  -ldflags '-X main.version=workbench-verification' \
  -o /tmp/planx-workbench-check.5IlA0M/engine ./cmd/engine

env -i PATH="$PATH" \
  HOME=/tmp/planx-workbench-check.5IlA0M \
  TMPDIR=/tmp/planx-workbench-check.5IlA0M \
  PORT=8080 \
  PLANX_PLUGIN_DIR=/tmp/planx-workbench-check.5IlA0M/no-external-plugins \
  PLANX_WORKBENCH_FILES=/tmp/planx-workbench-check.5IlA0M/files \
  /tmp/planx-workbench-check.5IlA0M/engine \
  -db-path /tmp/planx-workbench-check.5IlA0M/state.db \
  -max-active-executions 2 \
  -max-execution-inflight-bytes 16777216 \
  -max-engine-inflight-bytes 33554432
```

Engine build: exit 0. Startup reported the loopback listener, exclusive execution-store ownership, the builtin catalog, and zero interrupted executions. The file-root environment variable was added through a clean restart before the tested execution, without clearing the database.

## UI verification matrix

| Status | Check | Observed result |
| --- | --- | --- |
| VERIFIED | Real component catalog and tenant connection | Builtin Source, Processor and Sink entries loaded; file connection metadata saved and selected through the UI. |
| BLOCKED | Guided CSV RecordSchema input | The form submitted the schema as a string. Backend validation returned `csv: invalid config: json: cannot unmarshal string into Go struct field config.schema of type record.Schema`. |
| VERIFIED | Existing Raw JSON fallback | Supplying an object-valued schema passed configuration validation. Source connection probe reported connected. This does not make the guided form pass. |
| VERIFIED | Real source preview | Eight records returned, reported not truncated, with typed schema metadata. No simulated preview data was used. |
| VERIFIED | Special-value filter | Filter selected exactly fixture rows 1, 2, 5 and 8. Empty strings and NULL were distinct. Missing-presence data was not in this fixture. |
| VERIFIED | Keyboard divider | Right arrow changed split from 42 to 44. |
| VERIFIED | Expand and return | Configuration and eight rows remained present. The split table returned to horizontal scrollLeft 500; expanded width was 1120 px, split width 492 px. The initial immediate scroll read was unsettled and is not used as evidence. |
| VERIFIED | Changing selected node | Adding/selecting the passthrough processor retained the source table's eight rows. |
| VERIFIED | Sink static compatibility | Object-valued schema and `write_mode: create` passed config validation; compatibility reported `static_schema`, explicitly not runtime proof. |
| VERIFIED | Actual graph construction | UI handle dragging created Source -> Processor and Processor -> Sink edges. No hidden store mutation or imported fake graph was used. |
| VERIFIED | Real execution | One UI run click ultimately produced one successful execution and a new target file. See reconciliation below. |
| UNVERIFIED | Run confirmation and cancellation | CUA's click timed out in `Input.dispatchMouseEvent`; dialog lookup returned undefined and a subsequent focus command timed out. Reacquiring the tab later showed success. No controlled accept/dismiss observation was obtained. No second run click was made. |
| VERIFIED | Basic narrow viewport | At 390 x 844, after closing navigation, document and body widths both measured 390 px; configuration and run controls remained visible. The viewport override was reset. This is not a full mobile audit. |
| VERIFIED | Execution listing | UI showed one SUCCEEDED execution and all three nodes completed. |
| BLOCKED | Execution progress details | UI displayed `Execution progress unavailable. Last listed execution status is unchanged.` A read-only Retry progress produced the same result, despite persisted progress in SQLite. Root cause is not yet established. |
| UNVERIFIED | Sample preservation after running | Returning from graph/run to source configuration showed preview controls without the prior table. Preservation through node selection and expand/return passed; preservation across submit/run is not established. |

Browser warning/error log lookup returned no entries at the end of this session. That does not negate the visible progress failure.

## Real delivery and reconciliation

Actual configured path:

```text
workbench-files/source.csv
  -> builtin csv/source (batch_rows=3, explicit typed schema)
  -> Engine DAG
  -> builtin processors/passthrough
  -> builtin csv/sink (delivered.csv, write_mode=create)
  -> persisted execution progress and source-delivery acknowledgements
```

The graph's logical node IDs are `src-1`, `proc-1`, and `snk-1`. This is an observed configured/executed path, not a newly completed function-level runtime audit.

Pipeline ID: `60014f67-b057-468d-b7f4-af404f41e2c7`.

Execution ID: `27c27351-d5f7-47e2-9503-15526da75b88`.

Execution created at `2026-09-09 02:00:26.830644 UTC`, finished at `2026-09-09 02:00:26.851805 UTC`; status `SUCCEEDED`, empty error, all three nodes `completed`.

| Persisted evidence | Value |
| --- | ---: |
| Source output rows | 8 |
| Processor input / output rows | 8 / 8 |
| Sink attempted / committed rows | 8 / 8 |
| Sink synced batches | 3 |
| Source deliveries / acknowledged deliveries | 3 / 3 |
| Pending / unknown acknowledgements | 0 / 0 |
| ACK errors | 0 |
| Sink unknown commits | 0 |
| InFlight batches / bytes | 0 / 0 |
| Cleanup errors | 0 |
| Source bytes read / target bytes written | 812 / 739 |

Target contents were read directly and manually compared against the eight synthetic fixture rows. The output retained integer values `9007199254740993` and `9223372036854775807`, decimal values `12345678901234567890.123456789012345678` and `0.000000000000000001`, timestamps including `2026-09-09T01:30:00.123456Z`, and distinct empty notes and `\N` NULL markers. Preview schema metadata reported decimal precision 38 / scale 18 and timePrecision 6.

CSV output normalized trailing decimal zeroes (for example, `-12.340000000000000000` became `-12.34`). This was a value comparison, not a byte-identical or lexical-scale round trip. CSV output does not carry the schema by itself. No float conversion was introduced for display or comparison. The target was created once and not deleted, truncated or regenerated.

Read-only evidence commands:

```sh
sqlite3 -readonly /tmp/planx-workbench-check.5IlA0M/state.db \
  "SELECT name, sql FROM sqlite_master WHERE type='table' AND (name LIKE '%execution%' OR name LIKE '%pipeline%');"
stat -f 'target present: %z bytes' /tmp/planx-workbench-check.5IlA0M/files/delivered.csv
sqlite3 -readonly -json /tmp/planx-workbench-check.5IlA0M/state.db \
  "SELECT id,tenant_id,pipeline_id,status,error_msg,created_at,finished_at,node_statuses FROM executions; SELECT execution_id,tenant_id,progress_json FROM execution_progress;"
cat /tmp/planx-workbench-check.5IlA0M/files/delivered.csv
```

These commands exited 0. SQLite returned one execution and its progress record; stat reported 739 bytes; the target contained one header and eight data rows.

Two additional manual API probes were diagnostic attempts, not validation of the frontend's request contract:

```sh
curl --max-time 5 -sS -i -H 'X-Tenant-ID: workbench-verify-20260909' \
  http://127.0.0.1:8080/api/executions/27c27351-d5f7-47e2-9503-15526da75b88/progress
curl --max-time 5 -sS -i \
  'http://127.0.0.1:8080/api/executions/27c27351-d5f7-47e2-9503-15526da75b88/progress?tenantId=workbench-verify-20260909'
```

The first returned HTTP 400, `tenantId parameter required`; the second returned HTTP 404, `Execution not found`. Both were read-only. Route handling and the actual frontend request still need diagnosis; these probes do not prove a particular backend cause.

## Remaining gates and next work

1. Fix guided object/RecordSchema configuration without requiring users to escape JSON into a string.
2. Diagnose and repair execution-progress retrieval/display, then verify target commit, source acknowledgement and InFlight evidence separately in the UI.
3. Update toolbar regression coverage for current run/save behavior and verify confirm cancellation creates no execution or target write. Do not merely rename old assertions.
4. Clarify and test source-sample state across graph navigation, save and run; test splitter dragging/reset, full keyboard navigation and broader responsive behavior.
5. Rerun the affected tests and isolated UI checks after approved fixes. Existing target data must not be cleared to make reruns pass.

UNVERIFIED in this pass: read-only preview side effects were not independently measured before execution; restart/recovery, duplicate delivery and failure injection were not exercised. CSV source acknowledgements here are not proof of a durable database checkpoint or recovery behavior.

OUT OF SCOPE for this UI verification pass only, not removed from the overall approved matrix: SQL Server -> Typed Records -> Mapping/CEL -> Lookup -> Validate/Filter -> PostgreSQL -> source confirmation; real SOAP/XML, HTTP JSON, Oracle 10g, RabbitMQ and the other required targets; Arrow slicing; full connector compatibility and the remaining Builtin acceptance gates. None is marked passed by this file fixture.

The isolated state, synthetic source, delivered file and running local services are retained for diagnosis. They are test artifacts, not product dependencies. The browser's temporary viewport override was reset; the isolated execution-details tab was retained. No application or test bug was patched during verification.

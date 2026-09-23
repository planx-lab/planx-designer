# Managed workbench live acceptance, 2026-09-12

## Result and scope

**PASS: a fresh, post-fix PostgreSQL normal-delivery case was authored, saved,
confirmed, run, and observed in the actual Designer browser.** Independent native
SQL reconciled all target values exactly. This is not recovery of the earlier
failed case. That original pipeline remains fenced, its failed execution remains
visible, and its target remains empty.

This record supersedes the incomplete-draft scope of
[the September 10 browser record](2026-09-10-managed-pg-schema-browser.md) only for
the specific PG workflow below. It does not claim native-browser SQL Server,
Oracle, crash recovery, lost-COMMIT-response recovery, or general connector
compatibility. Other agents own those independent gates.

No Connection, pipeline, node, edge, saved specification, or execution in this
acceptance was created by a direct HTTP request or store injection. CUA operated
the real browser. Terminal HTTP reads, native SQL reads, and read-only SQLite
queries supplied independent evidence; they are not mislabeled browser traffic.
Fixture DDL and grants were terminal setup, not UI functionality.

## Versions and isolation

| Item | Actual acceptance environment |
| --- | --- |
| Designer baseline supplied by parent | `545744f`, plus the scoped uncommitted consumer changes listed below |
| Designer production assets | Vite preview on `http://127.0.0.1:18142`, refreshed after the final build |
| Owned Engine API | `127.0.0.1:18141`, separate private SQLite database; preview proxies `/api` |
| Initial Engine baseline | `48aa1c4`; an isolated baseline binary was built and retained |
| Metadata-enabled pre-fix binary | `engine-catalog-support`, SHA-256 `3a106b42c845fb58c116ca2e22827c3516edf23066cb08e4c64eeba9634162bc` |
| PK-fixed binary used for the positive case | `engine-readonly-cursor`, SHA-256 `9ad4a6c972133ae6de60a5191c2caf144e3314339b3156e25fd2c31347265451` |
| Builtin component version reported by Engine | `4.0.0-dev` |
| Database actually exercised | PostgreSQL **15.15**, approved isolated synthetic fixture over the existing SSH tunnel |
| Tenant | `designer-native-20260912-9o410T` |
| Owned synthetic schema | `px_browser_9o410t` |
| UI-used managed Connection | `pg-ui-scoped-9o410t`, version `1`, revision `a0460b6c-db2e-4638-bb10-4ce767a9ec94` |
| Dedicated fixture login | `px_ui_9o410t`; source/view/dimension SELECT, schema USAGE, and target SELECT/INSERT only |

Only the owned Engine instance was gracefully replaced. User servers, local
Docker, shared fixture containers, and SSH tunnel lifecycle were not disturbed.
The fixture owner was notified before setup and after data acceptance completed.
No previous target table was reused or cleared. No production data was accessed.
Credentials and private DSNs are deliberately absent from this record.

## Actual browser workflow

1. Created the original six nodes from the live Catalog and connected five graph
   edges by dragging the actual handles. The original Mapping/Lookup rules were
   entered through guided fields; ordinary ARRAY fields used their normal
   editors. The initial draft was saved before any resource binding or run.
2. Created the dedicated disposable database login through approved fixture
   setup. In Designer, selected **New connection**, entered its known synthetic
   username/password through normal CUA form entry, selected the structured PG
   fields, and clicked **Save connection**. The form returned the selected
   Connection and `Version 1`. No direct API-created Connection substitute was
   used. The shared fixture admin credential was not rotated.
3. Invoked **Discover** explicitly. The scoped result contained the owned
   `dimension_rows`, `source_rows`, `source_view (View)`, and `target_rows`.
   Selecting the view produced six native column checkboxes for the ARRAY-valued
   `columns` property. Selected all six in order. The real view preview returned
   three records, exact Int64/Decimal/temporal data, and separate NULL/empty cells.
   This is configuration-ARRAY coverage, not PostgreSQL array-valued SQL columns.
4. Switched the formal source to the immutable ordinary table `source_rows`,
   configured `batch_rows: 1`, `timeout_seconds: 20`, `cursor_column: record_id`,
   and `cursor_publication: ordered_append_only`. Column selection reverted to
   the component default on the table change. The final cursor definitions omit
   `columns`, meaning all source columns, not zero columns. Configuration
   validation and the separate read-only connection probe succeeded.
5. Bound Source, Lookup, and Sink to the scoped managed Connection. Lookup's
   editable configuration remained available, but its unsupported schema
   discovery action was absent with an explicit reason. New PG Connection
   creation was restricted to PG by Catalog metadata.
6. Ran the actual processed preview through `read -> map -> lookup -> validate
   -> filter`, then **Check compatibility** for the Sink. The browser reported
   `3 input rows`, `2 output rows`, `4 processors`, and `Static schema compatible`.
   The UI retained the distinction between these prechecks and real delivery.
7. Saved separately and independently confirmed zero executions and zero target
   rows before Run. The first real cursor run failed as described below.
8. After the parent repaired the demonstrated PK-discovery root cause, verified
   the original pipeline's refusal once. Then created a **distinct** new target
   and a **distinct** pipeline through normal Designer controls. The UI offered
   a read-only spec export but no import/duplicate action in the inspected flow.
   Re-created six Catalog nodes, pasted the earlier visible configurations into
   their normal per-node Raw JSON editors, and dragged the five graph edges.
   This was not a backend clone or API/store injection.
9. Repeated the fresh case's processed preview and target precheck, clicked Save,
   independently confirmed its zero-execution/empty-target boundary, and used
   **Run confirmation -> Confirm run**. Opened and expanded its actual Executions
   row to observe success and the separate delivery statistics.

The sage/cream appearance, logo, workflow structure, and existing editors were
preserved. CUA screenshots and accessibility observations are in the task
transcript; the successful execution browser tab was retained. Browser content
export was unsupported, so no exported-browser artifact is claimed.

## The two cases must remain distinct

| Evidence | Original failed case | Fresh post-fix normal-delivery case |
| --- | --- | --- |
| UI name | `Exact PG browser acceptance 9o410T` | `Post-fix PG normal delivery 9o410T` |
| Pipeline | `e776316a-f86b-4feb-8574-ebda6bac797f` | `0f774e5e-7c72-4cdf-bdbb-0b445b7518c5` |
| Executed saved revision | `e9cde370-b475-419a-8a26-385607e94fa9` | `c62ac6f9-5fd2-4338-89f4-80132972f75f` |
| Execution | `d8e5d5e7-26bd-4868-b683-13259255f8f1` | `e34113e4-dc27-4e56-87e0-3cc4b773a22d` |
| Result | FAILED, source Open | SUCCEEDED; all six nodes completed |
| Target | `px_browser_9o410t.target_rows` | `px_browser_9o410t.target_rows_postfix` |
| Final target rows | `0` | `2` |
| Delivery/cursor contracts | Both `unsafe`, unchanged | Both `clean` |

### Original failure, repair, and refusal

The failed definition used the **table**, not the view. The public error was
sanitized to `execution_failed; node=read; operation=open; stage=source`.
Deliveries, successful ACKs, and source output rows were zero. Downstream row
counts were unavailable because those nodes had not opened; they were not
relabeled successful zero-row execution. Native readback showed source `3`,
dimension `2`, target `0`.

A read-only query under the dedicated role returned:

```json
{
  "source_kind": "r",
  "primary_key_columns": ["record_id"],
  "old_information_schema_count": 0,
  "source_select": true,
  "source_insert": false,
  "source_update": false,
  "source_delete": false,
  "source_rows": 3,
  "target_rows": 0
}
```

Engine's previous `primaryKey` query joined
`information_schema.table_constraints` and `key_column_usage`. The SELECT-only
role could not see that constraint through this path. The parent independently
reproduced the real failure using the private scoped DSN, then changed only the
PG query to `pg_catalog.pg_constraint`, `conkey WITH ORDINALITY`, and
`pg_attribute`. Schema/table binding and ordered PK columns are preserved;
SQL Server/MySQL queries are unchanged. No source write privilege was granted.

Parent-reported gates for that repair: native RED `1.313s` (test `0.14s`), native
GREEN `3.351s` (test `0.40s`), focused SQL race `2.879s`. The native GREEN also
opened/closed the cursor source without ACK, checkpoint, or target writes.
These are parent-owned Engine checks, not Designer test output.

During diagnosis an attempted optional-field clear left an invalid intermediate
draft; it was saved but never run. The original valid cursor-enabled config was
restored using normal UI JSON paste, validated, and saved as revision
`3fbb520e-7c88-433c-8383-aeb59768b1c6`, with columns omitted as in the failed
definition. No recovery-disabled bypass was executed.

Read-only SQLite inspection found both `delivery:builtin.delivery.v1` and
`read/sql.cursor.v1` marked `unsafe`. After the patched binary started, one normal
UI Run confirmation returned HTTP `409`, code `recovery_blocked`, with the
message `Existing delivery evidence requires reconciliation before recovery`.
The UI did not retry; its explicit submission query returned 404. Independent
API inventory still showed exactly the original one failed execution. Both
contracts stayed unsafe and the original target stayed empty. No fence,
checkpoint, history, or outcome was reset or relabeled.

## Fresh workflow configuration and exact reconciliation

- Source: the same immutable three-row `source_rows`, signed Int64 PK, one row per
  delivery, original ordered-append-only cursor contract retained.
- Mapping: compute `amount` with exact CEL `record.amount * decimal('2')`, output
  kind `decimal`, precision `38`, scale `19`.
- Lookup: execution-fixed snapshot of `dimension_rows`, exact Int64 key
  `dimension_key -> id`, returned string `category -> category`. Dimension rows
  map `1 -> keep`, `2 -> drop`.
- Validate: required presence of all seven pipeline fields; assertions
  `record.empty_text == ''` and `record.amount >= decimal('-1')`.
- Filter: `record.category != 'drop'`.
- Sink: insert into the new `target_rows_postfix`, one row per transaction;
  seven explicitly ordered fields. The unselected `retained` column uses its
  database default, `ui-target-default`.

Both executions' captured definitions bound only `pg-ui-scoped-9o410t`, not the
unused setup resource. The confirmation dialog counted the two available
Connection metadata versions, but Engine correctly bound only the actual
reference.

Fresh UI and independent API observations:

| Node | Input rows | Output rows | Attempted rows | Committed rows | Unknown commits |
| --- | ---: | ---: | ---: | ---: | ---: |
| read | 0 | 3 | 0 | 0 | 0 |
| map | 3 | 3 | 0 | 0 | 0 |
| lookup | 3 | 3 | 0 | 0 | 0 |
| validate | 3 | 3 | 0 | 0 | 0 |
| filter | 3 | 2 | 0 | 0 | 0 |
| write | 2 | 0 | 2 | 2 | 0 |

Source deliveries `3`; successful source ACKs `3`; ACK errors `0`; unknown ACKs
`0`; pending ACKs `0`; in-flight batches/bytes `0`; cleanup errors `0`.
Lookup matched `3`, missing `0`, multiple matches `0`, queries `1`.
Filter reported `filtered_records: 1`. Source and Sink pool open/in-use gauges
were zero after completion. Zero gauges are not substitutes for commit/ACK proof.

Independent SQL used exact native Numeric/Timestamp values and **bidirectional
`EXCEPT ALL`** between the target and a source/dimension join computing
`source.amount * 2`, filtering `category <> 'drop'`, and supplying the expected
database default. It returned:

```json
{
  "source_rows": 3,
  "dimension_rows": 2,
  "original_target_rows": 0,
  "fresh_target_rows": 2,
  "expected_rows": 2,
  "bidirectional_exact_differences": 0,
  "filtered_id_absent": true
}
```

Exact independent target readback, with integers/decimals deliberately cast to
text and timestamps rendered at UTC microsecond precision:

```json
[
  {
    "record_id": "9007199254740993",
    "dimension_key": "1",
    "amount": "246913578024691356.2469135780246913578",
    "occurred_at": "2026-09-12T01:02:03.123456Z",
    "nullable_text": null,
    "empty_text": "",
    "category": "keep",
    "retained": "ui-target-default"
  },
  {
    "record_id": "9223372036854775806",
    "dimension_key": "1",
    "amount": "0.0000000000000000000",
    "occurred_at": "2026-09-12T01:02:03.000001Z",
    "nullable_text": "",
    "empty_text": "",
    "category": "keep",
    "retained": "ui-target-default"
  }
]
```

The filtered source ID `9223372036854775807` is absent from the target. Its
delivery was nevertheless acknowledged. Read-only SQLite evidence shows the
fresh source checkpoint at version `2`, last `9223372036854775807`; both fresh
contracts are clean. This proves this normal run's checkpoint persistence, not
restart recovery, broker durability, or exactly-once delivery.

## Designer changes and gates

The additive Catalog contract is consumed conservatively: explicit
`discoverSchema: true` enables discovery; explicit false disables it; omission
remains unsupported/unconfirmed, including external components. Config stays
editable. The external HTTP/RPC wire path was not changed. `connectionKinds`
filters both existing managed Connections and newly offered profiles, including
Lookup's borrowed PG profile. Metadata changes invalidate stale discovery and
credential-editor context.

Exact Designer source/test paths changed by this task:

- `src/types/plugin.ts`
- `src/components/editor/ConfigPanel.tsx`
- `src/components/editor/SchemaForm.tsx`
- `src/components/editor/ConnectionField.tsx`
- `src/components/editor/ConfigPanel.catalog-support.test.tsx` (new)
- `src/components/editor/ConfigPanel.discovery.test.tsx`
- `src/components/editor/ConfigPanel.discovery-error.test.tsx`
- `src/components/editor/ConfigPanel.async-context.test.tsx`

The ninth authored file is this evidence record. No Engine, canonical spec, logo,
stylesheet, or unrelated product file was edited by this Designer task. Parent
review of the consumer diff and eight new tests reported no additional finding.

| Gate | Observed result |
| --- | --- |
| New metadata tests before consumer fix | 7 failed, 1 passed (expected RED) |
| Focused final consumer gate | 8 files, 103 tests passed, `1.93s` |
| Full final Designer gate | 45 files, 475 tests passed, `5.14s` |
| `npm run lint` | Exit 0 |
| `npm run build` | Exit 0; existing large-chunk advisory, not a failure |

Measured Designer tooling: Node `26.8.1`, npm `11.19.0`, Vite `8.0.16`, Vitest
`4.1.9`, TypeScript `6.0.3`, ESLint `10.5.0`. Production main asset:
`dist/assets/index-B91FAK7b.js`, SHA-256
`bce2e51d3624c3984068f80fd9983e8cdce7c52210bc1476ffa265d905a77c1f`.
No Designer source changed after the full passing gate. These results do not
claim whole-workspace CI green; the parent's broader Engine lint/test follow-up
has its own evidence and ownership.

## Setup artifact, retention, and delivery boundary

Early credential-transfer helper attempts did not establish successful normal
credential entry. Protected-field/clipboard observations were misleading; no
credential-input product fix was justified. One helper-assisted form save left
the unused encrypted managed resource `pg-ui-9o410t`. It is a **failed setup
artifact**, not credited as the successful self-service credential-entry case.
No connection test or execution used that resource. The successful credential
case is the separately created dedicated login entered normally into
`pg-ui-scoped-9o410t`.

Managed no-op impact evidence for the unused artifact returned `pipelines: []`,
`users: []`, `runtimeChanged: false`. The current API supports GET/POST/PUT, not a
Connection deletion lifecycle. Per the parent's final instruction it remains
encrypted and unused; no unsupported deletion, raw SQLite edit, or key-store
mutation was attempted. All four one-use helper servers exited successfully.
Reopening the remaining temporary helper tab for cleanup was blocked by browser
policy; it was not retried or retained as a deliverable.

Both saved pipelines, execution histories, unique target contents, scoped
Connection, and private acceptance state are retained. The shared fixture owner
and parent were notified that data acceptance is complete; lifecycle remains
coordinated. No commit, push, production deployment, or Engine asset staging was
performed by this task.

The existing Engine staging mechanism is `make ui`: it runs `npm run build` in
`DESIGNER_DIR` (default `../planx-designer`), recreates
`internal/api/ui/dist`, and copies `../planx-designer/dist/.` into it. `make build`
depends on `ui`, then builds `./cmd/engine`. The parent owns that final staging
and binary build. This browser record used the separately refreshed production
Vite preview; it is not an acceptance claim for a later embedded binary.

## Final embedded artifact delta (2026-09-13): reopen failed safely

The parent supplied the final embedded binary at
`/private/tmp/planx-designer-ui-acceptance.9o410T/engine-final-embedded` after
reporting the root Engine race and lint gates green. Its SHA-256 is
`0494e45b780f390f0150ac8a2e4976e3accd2bd86ec81a1885ae6f9673d3dd85`.
The embedded root served `assets/index-B91FAK7b.js` and
`assets/index-N5hLnrj1.css`.

Only the owned `127.0.0.1:18141` Engine was replaced. The final binary opened
the same `/private/tmp/planx-designer-ui-acceptance.9o410T/ui-acceptance.db`
with the same plugin and management-origin arguments. Port `8080` and the
shared database fixtures were untouched.

The actual embedded Designer opened the already successful fresh pipeline
`0f774e5e-7c72-4cdf-bdbb-0b445b7518c5`. A normal run confirmation created
execution `5228ac86-48c5-4ba3-adb5-35e4b2f1d9fc`, bound to saved revision
`c62ac6f9-5fd2-4338-89f4-80132972f75f` and Connection runtime revision
`a0460b6c-db2e-4638-bb10-4ce767a9ec94`. The execution failed at source Open:

```text
execution failed; code=execution_failed; node=read; operation=open; stage=source
```

The embedded Executions view and execution API reported no delivery or row
effects: source deliveries `0`, successful ACKs `0`, unknown ACKs `0`, ACK
errors `0`, read input/output `0/0`, and write input/attempted/committed
`0/0/0`. The execution ran from `2026-09-12T16:37:10.208725Z` to
`2026-09-12T16:37:10.216740Z`.

Independent read-only PostgreSQL reconciliation after the failure preserved
the earlier positive delivery exactly:

```json
{
  "source_rows": 3,
  "dimension_rows": 2,
  "original_target_rows": 0,
  "fresh_target_rows": 2,
  "expected_rows": 2,
  "bidirectional_exact_differences": 0,
  "filtered_id_absent": true
}
```

The two fresh target rows retained the exact integer, decimal, UTC timestamp,
NULL/empty, category, and default-column values recorded above. The source
checkpoint also remained exact:

```json
{
  "version": 2,
  "fingerprint": "c6e223f6c2a63bb923bd39a112b07f4bab83e6ce33b086de7e22fd40d960ac84",
  "last": "9223372036854775807"
}
```

The failed Open changed both fresh recovery contracts from `clean` to
`unsafe`; they retain contract hash
`2ffe2b72bf3d99f62bd166da83f76d5cb3999defc9df78732f2d18d52e12d250`.
The original pipeline's delivery and cursor contracts remain `unsafe` with
hash `5b6fa7af416263453203edb0f38dcdc9627cb3390212a4676279e79ac473aed8`,
its target remains empty, and its sole original failed execution remains
untouched. No fence was cleared and no second run was attempted.

A bounded embedded-UI Connection test also returned HTTP `502` with
`connection_failed`, although the managed resource still reported version `1`,
configured password present, `ready: true`, and the expected runtime revision.
An independent password-authenticated PostgreSQL session using the private
scoped DSN succeeded as `px_ui_9o410t` with SELECT access to the source table.
The public execution error and owned Engine log expose no deeper cause. This
localizes the blocker to the final Engine's managed-connection path, but does
not establish its internal root cause.

This was one confirmed-frontier reopen attempt, not crash recovery or replay.
It did not pass the planned final artifact gate. The preserved target and zero
counters prove no data delivery, but the new `unsafe` fence is a real state
change. The parent was notified with the binary hash, execution ID, binding,
and no-effects evidence. Designer source and assets were not changed or
restaged for this delta.

### Bounded A/B correction: local PostgreSQL forward availability

A later controlled A/B held the Designer page, cwd, SQLite, adjacent credential
key, plugin directory, management origin, tenant, saved source configuration,
and managed Connection constant. It invoked only the read-only **Test
connection** operation; it did not run a pipeline.

| Engine binary | SHA-256 | Sanitized result |
| --- | --- | --- |
| `engine-readonly-cursor` | `9ad4a6c972133ae6de60a5191c2caf144e3314339b3156e25fd2c31347265451` | `Connected (read-only probe)` |
| `engine-final-embedded` | `0494e45b780f390f0150ac8a2e4976e3accd2bd86ec81a1885ae6f9673d3dd85` | `Connected (read-only probe)` |

The final binary was restored on `127.0.0.1:18141` with the original conditions.
The credential key remained mode `0600`, inode `83358729`, size `32`, and
SHA-256 `402de7f7ba4bc1aac2916134c226a15f39a9c72fda0c58019b367bc4a0eb86e0`.
The resource remained version `1`, `ready: true`, with password configured and
runtime revision `a0460b6c-db2e-4638-bb10-4ce767a9ec94`.

The smallest material delta was outside both Engine binaries. The PostgreSQL
forward now listening on `127.0.0.1:15432` belongs to SSH PID `20978`, which
started at `2026-09-13 00:40:54 +0800`, after the failed execution at
`2026-09-13 00:37:10 +0800`. It forwards `127.0.0.1:15432` to remote
`127.0.0.1:25432`. The prior fixture control-socket path no longer exists. The
failed execution ended in about 8 ms, consistent with an immediately
unavailable local endpoint rather than a database authentication timeout.

This A/B supersedes the earlier managed-connection-path localization. The final
binary decrypts and uses the same stored credential successfully once the local
PostgreSQL forward is available. The evidence narrows the original failure to
local tunnel availability during the first final-artifact attempt, not a
deterministic code or configuration delta between the two Engine binaries.

The A/B created no execution. The execution list remains the same three records,
both fresh contracts remain `unsafe` from the earlier failed Open, and both
original contracts remain `unsafe`. No credential, grant, data, checkpoint,
resource revision, or fence was changed.

## Current final embedded UI vertical acceptance (2026-09-13)

The current Engine binary `/private/tmp/planx-engine-oracle-final` (SHA-256
`8e37b7a683b5eee615fcbbccc633cba5c6c106fcca6383896c8892e13f1c4892`) ran
on the owned `127.0.0.1:18141` listener with the existing SQLite/key/plugin and
management-origin arguments. The production Designer remained on
`127.0.0.1:18142`.

The first newly authored UI pipeline used fresh empty target
`px_browser_9o410t.target_rows_final_20260913_0120`. Execution
`174aab5b-32a4-4fe3-9c94-cdacf992c7a9` failed safely at Sink Open because a
PostgreSQL `CREATE TABLE ... LIKE` fixture setup does not copy ACLs. All delivery,
row, ACK, commit and InFlight counters were zero; cleanup errors were zero; the
target remained empty. Pipeline `e68b54c1-2329-47ca-8f73-6c42a34a12c7` and its
delivery/cursor contracts remain `unsafe`. It was not rerun and no fence was
cleared.

Fixture setup then created a different empty target,
`px_browser_9o410t.target_rows_final_20260913_0127`, and granted the scoped
synthetic UI user `SELECT`, `INSERT` and `UPDATE`. `has_table_privilege` returned
true and the pre-run row count was zero. No `DELETE`, `TRUNCATE` or `DROP` was
used.

Through a separate blank Designer tab, the user flow then created six builtin
nodes and the five real DAG edges:

`PostgreSQL Source -> Mapping/CEL -> Lookup -> Validate -> Filter -> PostgreSQL Sink`

Each component configuration was edited and validated in the UI. Save created
new pipeline `8e88e7f9-3fec-49f5-8698-66018256a7fd`, revision
`63042e30-13e7-4e23-98e5-ec185d829f7c`. Run confirmation displayed two captured
tenant Connection versions and the independent target-commit/source-confirmation
warning. It was confirmed exactly once, creating execution
`d4cf7973-d92c-4685-9872-af7d23642997`.

The final embedded Executions UI reported `SUCCEEDED`; every node completed.
Observed counters:

| Boundary | Result |
| --- | ---: |
| Source deliveries / acknowledged | `3 / 3` |
| Unknown ACKs / ACK errors / pending ACKs | `0 / 0 / 0` |
| Source output | `3` |
| Mapping input/output | `3 / 3` |
| Lookup input/output/matched | `3 / 3 / 3` |
| Validate input/output/failures | `3 / 3 / 0` |
| Filter input/output/filtered | `3 / 2 / 1` |
| Sink input/attempted/committed/unknown | `2 / 2 / 2 / 0` |
| Cleanup errors / InFlight batches / bytes | `0 / 0 / 0` |
| Source and Sink open/in-use/idle pools after cleanup | `0 / 0 / 0` |

An independent PostgreSQL comparison derived expected output from the real
source joined to the dimension, applied exact decimal multiplication by two and
the `category <> 'drop'` filter, then compared both directions with
`EXCEPT ALL`. It returned source `3`, expected `2`, actual `2`, missing `0`,
unexpected `0`. The previous ACL-failure target remained `0`.

The retained target rows are:

| record_id | amount | occurred_at | NULL / empty | category |
| --- | --- | --- | --- | --- |
| `9007199254740993` | `246913578024691356.2469135780246913578` | `2026-09-12 01:02:03.123456+00` | `nullable_text IS NULL`, `length(empty_text)=0` | `keep` |
| `9223372036854775806` | `0.0000000000000000000` | `2026-09-12 01:02:03.000001+00` | `nullable_text IS NOT NULL`, `length(empty_text)=0` | `keep` |

SQLite independently records the execution as `SUCCEEDED` with an empty error.
The `sql.cursor.v1` checkpoint is version `2`, fingerprint
`7c1762a8b752a2ed0c624afc7e874093c7bcf86cf9f8ecc07c885d8ee7c4fa65`, and
last value `9223372036854775807`. Both the whole-delivery and source-cursor
recovery contracts are `clean`.
## 2026-09-13 Oracle Catalog boundary label

- The final Engine binary SHA-256 was `0237dfea6e03d25ef25c1d5c5b623d9f364dff7488813cdc61fd9692b5891543`.
- With Engine status visibly `Ready`, the Designer Component Catalog displayed `Oracle 11g (11.2.0.2 XE verified subset)`.
- This was a read-only UI check. No pipeline was saved or executed and no connector data was written.

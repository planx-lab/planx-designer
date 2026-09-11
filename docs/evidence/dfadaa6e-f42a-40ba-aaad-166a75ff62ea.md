# UI reference execution

- Execution ID: dfadaa6e-f42a-40ba-aaad-166a75ff62ea
- Pipeline ID: 9dd7e28a-6c6f-43b8-8f44-0c10ec35dea2
- Tenant: reference
- Status: SUCCEEDED
- Created: 2026-09-08T15:54:16.720425Z
- Finished: 2026-09-08T15:54:16.957364Z
- Submission: Designer UI at http://127.0.0.1:18081/, using the existing catalog and canvas.
- Source: sqlserver/source, connection_ref source, table reference.source_records, batch_rows 3. Actual table and eight-column discovery succeeded. No query workaround.
- DAG: read -> map -> enrich -> validate -> filter -> write.
- Target: postgres/sink, connection_ref target, reference.target_records, upsert on record_id. No truncate/delete or Connection POST during this acceptance run.
- Source deliveries/acknowledged: 3/3. Unknown acknowledgements: 0. ACK errors: 0. In-flight batches/bytes: 0/0.
- Read output: 8. Mapping/enrichment/validation: 8 -> 8 each. Filter: 8 -> 7. Write input/attempted/committed: 7/7/7. Unknown commits: 0.
- Exact exported UI files: ../reference.pipeline.json and ../reference.pipeline.yaml (apiVersion planx/v4).
- Raw detail: dfadaa6e-f42a-40ba-aaad-166a75ff62ea.detail.json; screenshot: dfadaa6e-f42a-40ba-aaad-166a75ff62ea.progress.png; DAG screenshot: dfadaa6e-f42a-40ba-aaad-166a75ff62ea.dag.png; UI snapshot: dfadaa6e-f42a-40ba-aaad-166a75ff62ea.ui.txt.

## Evidence boundary

UI-configured execution and backend counters: VERIFIED. On 2026-09-09 the parent reported the SQL/reference gates PASS. Designer did not independently perform the direct PostgreSQL value-by-value comparison: its shell has neither PLANX_TEST_POSTGRES_DSN nor psql, and Engine process credentials were not inspected. The parent's database evidence remains separately attributed; committed-row counters are not substituted for a direct comparison. No remaining UI/backend error blocks the Designer gate. Other vendors, MQ unknown-ACK behavior, CSV file boundaries, lookup refresh and budget-failure paths were not exercised by this SQL reference run.

## Read-only detail command

```sh
curl --silent --show-error --fail --max-time 5 'http://127.0.0.1:18080/api/executions/dfadaa6e-f42a-40ba-aaad-166a75ff62ea?tenantId=reference'
```

Exit: 0. The raw JSON response is preserved separately.

## Latest frontend baseline (no source changes during this UI acceptance)

- npm test -- --no-cache --reporter=dot: 151/151, 23 files, exit 0.
- npm test -- --no-cache --configLoader runner --reporter=dot: 151/151, 23 files, exit 0.
- npm run build: exit 0; existing large-chunk warning.

## Final staging, 2026-09-09

- Read-only GET /api/executions?tenantId=reference&page=1&pageSize=100: exit 0, total 1, the execution above is SUCCEEDED. No PENDING/RUNNING execution in reference. No new pipeline/source was started.
- Command: make ui, working directory /Users/mw/workspace/repo/github.com/planx-lab/planx-engine.
- Exit: 0. Existing target ran Designer tsc -b && vite build and reported UI staged at internal/api/ui/dist/.
- Only authorized generated assets were staged into Engine; no handwritten generated assets or Engine source/build-file edits by Designer. No service restart performed.
- Parent can proceed with the final single-binary build/smoke using the staged UI. That final smoke remains the parent's operation, not a Designer claim.

## PostgreSQL target reconciliation update (2026-09-09)

The parent task executed the existing read-only `pg-reconcile.sql` against the actual `reference.target_records` and reported exit 0. The parent saved the output as `dfadaa6e-f42a-40ba-aaad-166a75ff62ea.pg-reconcile.txt` beside this report. This supersedes the earlier pending status for that target inspection only.

- Actual target rows: 7; NULL amount rows: 0; distinct record IDs: 7.
- The output preserves decimal(38,18) positive/negative boundaries, +/-1e-18, int64 minimum/maximum, NULL versus empty strings, UTF-8, and UTC values.
- This is parent-executed PostgreSQL evidence, not a new Designer execution or a Designer-issued database query. No pipeline rerun or Connection metadata update was performed by Designer.
- Bidirectional EXCEPT against the PostgreSQL source mirror remains PENDING. The planned 8 source / 1 filtered / 7 expected / 7 actual / 0 differences result is not yet claimed as verified.

## Bidirectional comparison completed (2026-09-09)

The parent task subsequently reported that the read-only bidirectional EXCEPT completed with exit 0: source 8, filtered 1, expected 7, actual 7, missing 0, unexpected 0. The comparison includes all 10 columns, covering numeric values, instants, NULL/empty/UTF-8 distinctions, and dimension enrichment. This supersedes the PENDING comparison status above.

Expected rows were derived from the PostgreSQL `source_records` and `dimension` mirror previously reconciled with the initial SQL Server fixture. This comparison is not evidence of a second SQL Server read. Designer did not rerun the original reference pipeline or modify its resources, target, or checkpoint.

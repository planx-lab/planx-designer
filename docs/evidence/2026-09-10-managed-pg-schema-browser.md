# Managed PostgreSQL schema browser acceptance, 2026-09-10

## Scope and redaction

This is actual browser/API evidence for the embedded UI **before** the ARRAY column
selector implementation. It does not certify a native column picker or a complete
Source-to-Sink pipeline.

The browser used only the isolated loopback acceptance Engine on port 18084.
Its observed root script was `/assets/index-wLUefi3l.js`.
The user's existing port 18083 was not opened or changed.

Private paths, tenant UUIDs, connection revision UUIDs, container IDs, database
connection parameters and schema identifiers are omitted here. Placeholders below
are redactions, not the literal values transmitted. The complete nonsecret
identifier/revision record remains in the private acceptance artifacts.

## Approved synthetic setup

The existing synthetic PostgreSQL container's immutable identity, running state,
local binding and approved purpose/task labels were checked before accessing
`Config.Env`. Its password was consumed only inside a private Node process and
the managed create request body. It was not printed, placed in process arguments,
stored in an evidence file or entered in the browser.

A new owned tenant and two connections, A and B, pointed to the already-approved
synthetic fixture. No production database, new resource, existing SQL target
fixture reset or data write was used.

Actual health GET returned `managed-v1` and `draft-v1`. Two managed create POSTs
succeeded. Connection-list GET used the single `{connections:[...]}` envelope;
list and item GETs returned structured nonsecret metadata and configured flags.

## Browser sequence and observations

| Step | Actual observation |
| --- | --- |
| Add PostgreSQL Source, choose A, Discover | Actual table options appeared; 803 options observed after selecting the approved dimension table. |
| Table/view presentation | The dimension table had a Table label; a genuine discovered projection view had a View label. No invented schema was injected. |
| Select the dimension table | The configured qualified name was retained. The current ARRAY columns field was a JSON textarea, not discovered-column checkboxes. |
| Raw JSON A to B, then Schema Form | Old table choices disappeared: SELECT became INPUT with zero options. The exact configured table string remained; Discover was enabled and no alert was shown. |
| Save source-only incomplete draft | Saved successfully; Run confirmation remained disabled. |
| Explicit B rediscovery | Actual table choices returned; 803 options were observed again. |
| Edit B display name only | Editor showed its original revision. Password action remained Keep; no secret input was rendered. |
| Review changes | Display-only change; one saved pipeline, zero actual users; no stop or automatic restart requested. |
| Apply changes for the same ID | Editor closed; ID B and the new display name remained. Table choices were cleared again, configured table unchanged, Discover enabled. |
| Executions page | Owned tenant showed 0 total and No executions yet. |
| Browser diagnostics | The warning/error log query returned an empty array. |

Only the exact `Connection name` field was filled in the connection editor.
A transient tool-text discrepancy showed an empty username while the actual
screenshot visibly showed the original username. The username was only focused,
never filled. Successful display-only impact and unchanged saved parameters
corroborated the screenshot. This was **not** classified as a product bug.

## Separate actual HTTP column evidence

These were real independent terminal HTTP requests, not a captured browser
network trace or a unit double:

```http
POST /api/plugins/discover-schema
Content-Type: application/json

{
  "pluginId": "postgres",
  "componentId": "source",
  "tenantId": "<owned-synthetic-tenant>",
  "config": {
    "connection_ref": "<A-or-B>",
    "table": "<synthetic-schema>.dimension_rows"
  }
}
```

Each request returned HTTP 200 with:

```json
{"columns":[{"name":"id","type":"bigint"},{"name":"category","type":"text"}]}
```

The requests did not run a pipeline, preview source rows, acknowledge a source,
save a checkpoint or write a target.

## Post-save metadata comparison

A real GET of B after browser Apply returned HTTP 200. The independent Node
stdin assertion command exited 0 with every check true:

- Same connection ID, tenant and driver.
- Only the intended display name changed.
- Editor revision changed.
- Runtime revision stayed identical.
- Version stayed 1.
- All five original nonsecret parameters were identical.
- Password configured flag remained true.
- No extra secret-bearing top-level metadata fields appeared.

This compares revision/metadata evidence, not stored credential bytes.

## Acceptance boundary

VERIFIED: real table discovery and kind labels; Raw JSON connection-switch
invalidation; explicit rediscovery; same-ID name-only save invalidation; retained
configured table; unchanged runtime revision/parameters; owned-tenant zero
executions.

UNVERIFIED in this bounded browser pass: forced delayed responses, A-to-B-to-A
browser timing, visible ARRAY column candidate clearing, Source-to-Sink delivery,
source ACK and recovery behavior. The column HTTP result does not turn the
existing JSON textarea into a verified column-selection UI.

The parent reported the prior full Designer checkpoint as 43 files / 446 tests
passing and embedded build exit 0. This browser record does not claim a rerun of
those commands.


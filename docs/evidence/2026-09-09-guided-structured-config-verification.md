# Guided Mapping and Lookup configuration

Date: 2026-09-09. Scope: one workbench configuration stage, not completion of
the full builtin integration matrix. Authority remains ADR-017 and the approved
operation-workflow direction. Existing colors, logo, data-space split and source
evidence boundaries are preserved.

## IMPLEMENTED

- `SchemaForm.tsx` delegates advertised ARRAY fields with item properties to
  `StructuredArrayField.tsx`. The same Catalog metadata drives Mapping operations,
  Lookup keys/return fields, and other matching schemas; no component-ID registry,
  duplicate configuration format or Engine behavior was added to the UI.
- Object-list entries can be added, moved, removed and restored with one-step
  deletion undo. Stable row identities keep controls attached to their records.
- Required and populated properties are visible; optional properties are added
  explicitly. Nested objects with declared properties support guided editing.
  Unknown properties remain intact. Undeclared item shapes and dynamic objects
  retain JSON editing rather than a guessed form.
- Required top-level configuration and structured entries precede optional
  tuning, which remains available under the collapsed additional-settings section.
- Numeric drafts reject malformed text without replacing the last accepted
  value. Decimal NUMBER edits use lossless parsing; INTEGER converts to a JS
  number only within the safe-integer range. Optional unset, false, empty text
  and typed literal NULL are not silently substituted for one another.
- The entry editor refuses its mode switch and row adjustments while an invalid
  numeric/JSON draft is pending. It exposes the existing invalid-config marker
  used by run confirmation. This is not a claim that every navigation action
  elsewhere in the application has a draft-preservation guard.
- A browser-discovered existing enum defect was fixed: a missing mode formerly
  displayed the first option (`snapshot`) while the actual config was `{}`.
  Missing selections now visibly remain unset; unknown values are retained and
  flagged; explicit advertised defaults remain supported without writing them
  into config on render. Clearing an optional enum removes that config property.
- `StructuredArrayField.css` is locally scoped and inherits the established
  theme. Controls stack on narrow screens; no brand assets or global theme
  tokens were replaced.

## VERIFIED: executable regression

Commands ran from the org workspace root:

```sh
npm --prefix planx-designer test -- --run src/components/editor/StructuredArrayField.test.tsx --reporter=dot
npm --prefix planx-designer test -- --reporter=dot
npm --prefix planx-designer run build
```

Final full suite: **31 files, 249 tests passed, exit 0**. The new file contains
16 cases. The existing enum test now asserts the unset option plus both original
choices; it was not deleted or weakened to omit the original choices.

The regression covers metadata-driven creation, exact CEL configuration,
preserved unknown fields and large numbers, invalid drafts, exact decimal input,
unset/false/empty distinctions, reorder/control identity/delete undo, composite
keys with unique label targets, nested literals, JSON fallback, malformed
existing values, optional tuning placement, and the four enum boundaries.

Retained RED progression: initial 10 failures/1 pass; initial implementation
3 failures/8 passes (add-button accessible name and the legacy required-label
query); corrected 11/11; then 245/245 after the tuning-placement case. The enum
change produced 248 passes/1 failure in the old option-count assertion before
the final 249/249. No native delivery test was rerun to mask a frontend failure.

Final TypeScript/Vite build exited 0 using the installed Vite 8.0.16. Main JS:
1,011.04 kB, gzip 303.50 kB; CSS 73.52 kB; lazy JSON editor 512.60 kB. The existing
over-500-kB chunk advisory remains; this stage is not a bundle-optimization claim.
No dependency upgrade was performed.

Final command logs:

```text
/tmp/planx-structured-editor-verified-suite.log
/tmp/planx-structured-editor-verified-build.log
```

Earlier RED/intermediate logs remain under the matching
`/tmp/planx-structured-editor-*.log` names.

## VERIFIED: actual browser interaction

Used the existing `http://localhost:18083/` workbench. Its initial task was blank.
All Catalog entries came from the running Engine. Only the new local browser
draft was edited; no pipeline run was requested and no connection was created.

Mapping was authored entirely through fields:

```json
{
  "operations": [{
    "op": "compute",
    "to": "amount",
    "expression": "record.amount == null ? null : record.amount * decimal('-1')",
    "kind": "decimal",
    "precision": 38,
    "scale": 18,
    "nullable": true
  }]
}
```

The existing `Validate Config` action returned the visible success message
stating that configuration is valid but the connection has not been tested.
The native records factory's Validate path compiles the configuration/CEL; it
does not execute the pipeline. Entering `38x` kept the invalid draft visible and
blocked the entry editor's JSON-mode switch. Correcting it to `38` yielded the
exact visible JSON above.

Lookup was also authored through fields, and its complete visible JSON was
inspected: explicit `snapshot`, `fixture-v1`, `reference.dimension`; composite
keys `(tenant_key:string, dimension_key:int64)`; returned
`dimension_label:string` and `dimension_version:int64`. No connection reference
was fabricated to make this draft look runnable.

Observed layout measurements in the browser:

| Viewport | Document scroll width | Each new editor client/scroll width |
|---|---|---|
| 375 x 812 | 375 | 271 / 271 |
| 1280 x 900 | 1280 | 339 / 339 |

Both views were visually inspected. Narrow-screen fields stack and the desktop
retains the independent right-hand data area. This is scoped layout evidence,
not an exhaustive accessibility, zoom, device or browser compatibility audit.
The viewport override was reset after checking.

Some automation locators needed reacquisition: reopening the Catalog selected
Sources, native AX node-navigation roles differed from DOM roles, and the active
node returned to the first node around rebuilds. No such selector failure was
counted as a passing browser assertion. The completed checks used fresh state
after the final build finished.

## UNVERIFIED / remaining stages

- This browser draft has no source, sink or connection resource. Lookup connection
  compatibility, lookup execution and whole-chain browser delivery were not
  claimed. Earlier isolated SQL Server/PostgreSQL runtime evidence remains a
  separate gate, not proof of this draft's execution.
- The right-hand panel still shows only source evidence. Unified Runtime preview
  after Mapping/CEL/Lookup/Validate/Filter is not implemented by this stage.
- Source record-schema authoring, target field/type reconciliation and the
  remaining operation-flow refinements still require work. JSON fallback was
  preserved intentionally, not presented as a fully guided implementation.
- No Engine, public data contract, Resolver, DAG, SDK, canonical/mirror rule,
  repository layout, production resource, remote repository or release changed.

Next product slice: connect bounded post-processing sample evidence to the
existing Runtime/operation APIs and make target compatibility review consume the
actual post-processing schema, without pretending a source sample is a result.

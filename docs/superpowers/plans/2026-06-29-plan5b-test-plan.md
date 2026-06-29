# Plan 5b T2 Test Plan: SchemaForm

## Test types
- **Unit**: vitest + @testing-library/react — render SchemaForm, assert DOM
- **Integration**: ConfigPanel integration — existing Playwright e2e covers (will update mocks)
- **Browser e2e**: Playwright — schema form renders when configSchema present

## Unit test cases (vitest)

### Field rendering
| # | Test | Input | Expected render |
|---|------|-------|-----------------|
| 1 | StringField | `{name:"host", type:STRING, label:"Host"}` | `<input type="text">` with label "Host" |
| 2 | IntegerField | `{name:"port", type:INTEGER}` | `<input type="number">` |
| 3 | BooleanField | `{name:"tls", type:BOOLEAN}` | `<input type="checkbox">` |
| 4 | SecretField | `{name:"api_key", type:SECRET}` | `<input type="password">` |
| 5 | EnumField | `{name:"mode", type:ENUM, enumValues:["fast","safe"]}` | `<select>` with 2 options |

### Value binding + onChange
| # | Test | Expected |
|---|------|----------|
| 6 | String onChange | typing "localhost" → onChange called with `{host: "localhost"}` |
| 7 | Integer onChange | typing 5432 → onChange called with `{port: 5432}` (number, not string) |
| 8 | Boolean onChange | check/uncheck → onChange with `{tls: true/false}` |
| 9 | Enum onChange | select "safe" → onChange with `{mode: "safe"}` |
| 10 | Multiple fields | changing one field preserves others |

### Required + defaults
| # | Test | Expected |
|---|------|----------|
| 11 | Required asterisk | `required:true` field shows red "*" |
| 12 | Default value | `default: StringValue("localhost")` → input shows "localhost" |
| 13 | Placeholder | `placeholder: "e.g. localhost"` → input shows placeholder |

### Empty schema
| # | Test | Expected |
|---|------|----------|
| 14 | No fields | renders nothing (empty div) |

## E2E test additions (Playwright)
| # | Test | Steps |
|---|------|-------|
| 15 | Schema form renders for source-hello | Mock API with configSchema → click source node → form renders (not CodeMirror) |
| 16 | Raw JSON toggle | Click "Raw JSON" button → CodeMirror appears; toggle back → form returns |

## Pass criteria
- All 14 unit tests PASS
- All Playwright tests PASS (existing 27 + new 2)
- `tsc --noEmit` zero

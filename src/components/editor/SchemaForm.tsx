import { StructuredArrayField } from './StructuredArrayField';
import { useEffect, useRef, useState } from 'react';
import { isInteger, isNumber, isLosslessNumber, stringify } from 'lossless-json';
import { parseJson, parseJsonNumber } from '@/lib/json';
import type { ConfigSchema, ConfigField, TableInfo, ColumnInfo } from '@/types/plugin';
import { ConnectionField } from './ConnectionField';

interface SchemaFormProps {
  schema: ConfigSchema;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  tenantId?: string;
  connectionDriver?: string;
  /** Selection or managed settings changed, including saves retaining the same ID. */
  onConnectionChange?: () => void;
  /** Workbench authoring of the public typed-data schema; legacy JSON remains available. */
  recordSchemaForms?: boolean;
  /** Discovered tables — when populated, a field named "table" renders a dropdown. */
  tables?: TableInfo[];
  /** Discovered columns — when populated, a field named "columns" renders a checkbox group. */
  columns?: ColumnInfo[];
  /** Triggered by the "Discover Tables" button under the table field. */
  onDiscoverTables?: () => void;
  /** Triggered when the table selection changes (auto-discovers columns). */
  onTableChange?: (table: string) => void;
  /** Discovery in flight — disables the Discover Tables button. */
  loadingDiscovery?: boolean;
}

function getDefaultValue(field: ConfigField): unknown {
  if (!field.defaultValue) return undefined;
  switch (field.type) {
    case 'STRING':
    case 'SECRET':
    case 'ENUM':
      return field.defaultValue.stringValue;
    case 'INTEGER':
      return field.defaultValue.intValue;
    case 'NUMBER':
      return field.defaultValue.numberValue;
    case 'BOOLEAN':
      return field.defaultValue.boolValue;
  }
}

function getCurrentValue(value: Record<string, unknown>, field: ConfigField): unknown {
  if (field.name in value) return value[field.name];
  return getDefaultValue(field) ?? '';
}

/** Text input avoids browser/Number coercion and retains incomplete edits. */
function NumericField({ field, value, onChange }: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const literal = String(value ?? '');
  const [draft, setDraft] = useState(() => ({ literal, text: literal }));
  const text = draft.literal === literal ? draft.text : literal;
  const accepts = (next: string) =>
    isNumber(next) && (field.type !== 'INTEGER' || isInteger(next));

  return (
    <input
      type="text"
      inputMode={field.type === 'INTEGER' ? 'numeric' : 'decimal'}
      id={field.name}
      value={text}
      aria-invalid={text !== '' && !accepts(text)}
      data-config-invalid={text !== '' && !accepts(text) ? 'true' : undefined}
      onChange={(e) => {
        const next = e.target.value;
        setDraft({ literal, text: next });
        if (next === '') onChange(undefined);
        else if (accepts(next)) onChange(parseJsonNumber(next));
      }}
      placeholder={field.placeholder}
      className="w-full bg-muted border border-border rounded-md h-8 px-2.5 text-xs text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent"
    />
  );
}

/** Structured fields keep exact JSON values, not escaped strings or Number coercions. */
function StructuredField({ field, value, onChange }: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const serialize = (next: unknown) => next === undefined || next === '' ? '' : stringify(next, null, 2) ?? '';
  const literal = serialize(value);
  const [text, setText] = useState(literal);
  const expected = useRef(literal);
  useEffect(() => {
    if (literal !== expected.current) setText(literal);
    expected.current = literal;
  }, [literal]);

  const parse = (next: string): unknown => {
    if (!next.trim()) {
      if (field.required) throw new Error('Required');
      return undefined;
    }
    const parsed = parseJson(next);
    const valid = field.type === 'ARRAY' ? Array.isArray(parsed)
      : parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && !isLosslessNumber(parsed);
    if (!valid) throw new Error('Wrong JSON shape');
    return parsed;
  };
  let error = '';
  try { parse(text); } catch {
    error = `Enter a valid JSON ${field.type === 'ARRAY' ? 'array' : 'object'}. Invalid edits are not applied; running is blocked until corrected.`;
  }
  return (
    <div className="space-y-1">
      <textarea
        id={field.name}
        value={text}
        rows={6}
        spellCheck={false}
        aria-invalid={!!error}
        aria-describedby={`${field.name}-json-help${error ? ` ${field.name}-json-error` : ''}`}
        data-config-invalid={error ? 'true' : undefined}
        data-config-draft-invalid={error && text !== literal ? 'true' : undefined}
        placeholder={field.placeholder ?? (field.type === 'ARRAY' ? '["field"]' : '{"fields": []}')}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          try {
            const parsed = parse(next);
            expected.current = serialize(parsed);
            onChange(parsed);
          } catch { /* Keep the unapplied draft visible without corrupting the config. */ }
        }}
        className="w-full resize-y bg-muted border border-border rounded-md p-2.5 text-xs font-mono text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <p id={`${field.name}-json-help`} className="text-[10px] text-foreground/50">JSON {field.type === 'ARRAY' ? 'array' : 'object'}. Valid edits apply immediately; numbers remain exact.</p>
      {error && <p id={`${field.name}-json-error`} role="alert" className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

const recordFieldProperties: ConfigField[] = [
  { name: 'name', type: 'STRING', label: '字段名称', required: true },
  { name: 'kind', type: 'ENUM', label: '数据类型', required: true, enumValues: ['bool', 'int64', 'uint64', 'decimal', 'float64', 'string', 'binary', 'date', 'datetime', 'timestamp', 'uuid', 'list', 'struct'] },
  { name: 'nullable', type: 'BOOLEAN', label: '可空 nullable', description: '明确设置 true 或 false；未设置保持缺省。Missing 与 NULL 不相同。' },
  { name: 'precision', type: 'INTEGER', label: 'Decimal precision', description: 'Decimal 总精度，按来源或转换契约填写；不从样本猜测。' },
  { name: 'scale', type: 'INTEGER', label: 'Decimal scale', description: 'Decimal 小数位数；不代替时间精度。' },
  { name: 'timePrecision', type: 'INTEGER', label: '时间精度 timePrecision', description: '仅 DateTime/Timestamp，范围 0-9；0 为整秒，未设置为未知。' },
];
// Recursive metadata is local UI vocabulary, never serialized into config/catalog.
recordFieldProperties.push(
  { name: 'fields', type: 'ARRAY', label: '嵌套字段', properties: recordFieldProperties },
  { name: 'element', type: 'OBJECT', label: '列表元素', properties: recordFieldProperties },
);
const recordFields: ConfigField = { name: 'fields', type: 'ARRAY', label: '字段', properties: recordFieldProperties };

function RecordSchemaField({ field, value, onChange }: { field: ConfigField; value: unknown; onChange: (value: unknown) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const object = (next: unknown): next is Record<string, unknown> => next !== null && typeof next === 'object' && !Array.isArray(next) && !isLosslessNumber(next);
  const schema = value === undefined || value === '' ? {} : object(value) ? value : null;
  const valid = schema !== null && (schema.fields === undefined || (Array.isArray(schema.fields) && schema.fields.every(object)));
  const [raw, setRaw] = useState(!valid);
  const [error, setError] = useState('');
  return <div ref={root} className="space-y-2">
    <button type="button" className="workbench-button" onClick={() => {
      if (root.current?.querySelector(raw ? '[data-config-invalid="true"]' : '[data-config-draft-invalid="true"]')) {
        setError('请先修正未应用的 Schema 草稿，再切换编辑模式。'); return;
      }
      if (!valid) { setError('当前 Schema 结构需要在高级 JSON 中修正；原值已保留。'); return; }
      setError(''); setRaw((current) => !current);
    }}>{raw ? 'Schema 字段表单' : 'Schema 高级 JSON'}</button>
    <p className="text-[11px] text-foreground/50">声明此组件使用的完整字段契约，不会从首条样本推断完整 Schema。字段类型、Decimal 精度、时间精度与可空性按实际数据填写；仍需显式校验配置。</p>
    {error && <p role="alert" className="text-xs text-warning">{error}</p>}
    {raw || !valid ? <StructuredField field={field} value={value} onChange={onChange} /> : <>
      <StructuredArrayField field={recordFields} value={schema.fields} onChange={(fields) => onChange({ ...schema, fields })}
        fallback={<StructuredField field={{ ...recordFields, name: `${field.name}-fields` }} value={schema.fields} onChange={(fields) => onChange({ ...schema, fields })} />} />
      {Object.keys(schema).some((name) => name !== 'fields') && <p className="text-[11px] text-foreground/50">Schema 的其他属性已原样保留，可在高级 JSON 中编辑。</p>}
    </>}
  </div>;
}

function BasicSchemaForm({
  schema,
  value,
  onChange,
  tenantId = '',
  connectionDriver,
  onConnectionChange,
  recordSchemaForms,
  tables,
  columns,
  onDiscoverTables,
  onTableChange,
  loadingDiscovery,
}: SchemaFormProps) {
  if (schema.fields.length === 0) {
    return null;
  }

  const handleChange = (field: ConfigField, newValue: unknown) => {
    onChange({ ...value, [field.name]: newValue });
  };

  // Parse a comma-separated columns value into a Set of checked names.
  // Empty/absent value means "all checked" (the default), matching the
  // spec convention: all columns selected unless the user opts out.
  const checkedColumns = (field: ConfigField): Set<string> => {
    const raw = getCurrentValue(value, field);
    if (typeof raw === 'string' && raw.length > 0) {
      return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
    }
    return new Set((columns ?? []).map((c) => c.name));
  };

  const renderTableField = (field: ConfigField) => {
    const currentValue = getCurrentValue(value, field) as string;
    return (
      <div className="flex items-center gap-1.5">
        {!tables?.length ? (
          <input
            type="text"
            id={field.name}
            value={currentValue}
            onChange={(e) => handleChange(field, e.target.value)}
            placeholder={field.placeholder ?? 'schema.table'}
            className="flex-1 min-w-0 bg-muted border border-border rounded-md h-8 px-2.5 text-xs text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        ) : (
        <select
          id={field.name}
          value={currentValue}
          onChange={(e) => {
            handleChange(field, e.target.value);
            onTableChange?.(e.target.value);
          }}
          className="flex-1 bg-muted border border-border rounded-md h-8 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {!tables.some((t) => `${t.schema}.${t.name}` === currentValue) && (
            <option value={currentValue}>{currentValue || 'Select a table or view'}</option>
          )}
          {tables.map((t) => (
            <option key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>
              {t.schema}.{t.name} ({t.kind === 'TABLE' ? 'Table' : t.kind === 'VIEW' ? 'View' : 'Unknown kind'})
            </option>
          ))}
        </select>
        )}
        {onDiscoverTables && (
          <button
            type="button"
            onClick={onDiscoverTables}
            disabled={loadingDiscovery}
            className="shrink-0 bg-accent hover:bg-accent/80 text-accent-foreground rounded-md text-[10px] px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {loadingDiscovery ? '...' : 'Discover'}
          </button>
        )}
      </div>
    );
  };

  const renderColumnsField = (field: ConfigField) => {
    if (!columns || columns.length === 0) {
      const currentValue = getCurrentValue(value, field) as string;
      return (
        <input
          type="text"
          id={field.name}
          value={currentValue}
          onChange={(e) => handleChange(field, e.target.value)}
          placeholder={field.placeholder ?? 'col1,col2 (at least one required)'}
          className="w-full bg-muted border border-border rounded-md h-8 px-2.5 text-xs text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent"
        />
      );
    }

    const checked = checkedColumns(field);
    const toggle = (name: string) => {
      const next = new Set(checked);
      if (next.has(name)) {
        // Prevent unchecking the LAST remaining column: empty columns means
        // "SELECT *" in the plugin, which is dangerous (silent schema drift).
        if (next.size <= 1) return;
        next.delete(name);
      } else {
        next.add(name);
      }
      // Preserve column discovery order for a stable comma-separated value.
      const ordered = columns
        .map((c) => c.name)
        .filter((n) => next.has(n));
      handleChange(field, ordered.join(','));
    };
    // A column is locked (cannot be unchecked) when it is the only checked one.
    const isLocked = (name: string): boolean =>
      checked.has(name) && checked.size <= 1;

    return (
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 max-h-40 overflow-y-auto rounded-md border border-border p-1.5">
        {columns.map((col) => {
          const colId = `col-${col.name}`;
          const locked = isLocked(col.name);
          return (
            <label
              key={col.name}
              htmlFor={colId}
              className={`flex items-center gap-1 text-[11px] text-foreground ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <input
                id={colId}
                type="checkbox"
                checked={checked.has(col.name)}
                onChange={() => toggle(col.name)}
                className="accent-accent h-3 w-3"
                title={locked ? 'At least one column required' : undefined}
                disabled={locked}
              />
              <span className="truncate">{col.name}</span>
              <span className="text-foreground/30 text-[10px]">{col.type}</span>
            </label>
          );
        })}
      </div>
    );
  };

  // Named columns convention only; selection remains an ordered string array.
  const renderArrayColumnsField = (field: ConfigField, selection: string[] | undefined) => {
    const selected = selection ?? [];
    const positions = new Map(selected.map((name, index) => [name, index]));
    const discovered = new Map((columns ?? []).map((column) => [column.name, column]));
    const choices = [...selected, ...Array.from(discovered.keys()).filter((name) => !positions.has(name))];
    const missing = !!field.required && selection === undefined;
    const helpId = `${field.name}-selection-help`;

    return (
      <div id={field.name} role="group" aria-label={field.label || field.name} className="space-y-1.5"
        data-config-invalid={missing ? 'true' : undefined}
        aria-describedby={`${helpId}${field.description ? ` ${field.name}-selection-description` : ''}${missing ? ` ${field.name}-selection-error` : ''}`}>
        <p className="text-[11px] text-foreground/60">{selection === undefined
          ? 'No explicit column list is configured.'
          : selected.length === 0 ? 'Explicit empty array ([]).' : `${selected.length} explicitly selected columns.`}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1 max-h-40 overflow-y-auto rounded-md border border-border p-1.5">
          {choices.map((name, index) => {
            const position = positions.get(name);
            const column = discovered.get(name);
            const colId = `${field.name}-array-col-${index}`;
            return (
              <label key={name} htmlFor={colId} title={name} className="flex items-start gap-1 text-[11px] text-foreground cursor-pointer">
                <input id={colId} type="checkbox" aria-label={name} checked={position !== undefined}
                  onChange={() => handleChange(field, position === undefined
                    ? [...selected, name] : selected.filter((entry) => entry !== name))}
                  className="accent-accent h-3 w-3 mt-0.5 shrink-0" />
                <span className="min-w-0 whitespace-pre-wrap break-words">{name}</span>
                {position !== undefined && <span aria-hidden="true" className="text-[10px] text-foreground/40">#{position + 1}</span>}
                <span className={column ? 'text-[10px] text-foreground/40' : 'text-[10px] text-warning'}>
                  {column ? column.type : 'Not in current discovery'}
                </span>
              </label>
            );
          })}
        </div>
        {field.description && <p id={`${field.name}-selection-description`} className="text-[10px] text-foreground/50">{field.description}</p>}
        <p id={helpId} className="text-[10px] text-foreground/50">Selections keep their order. Clearing the last checkbox writes []. Empty or unset columns follow the component's selection/default rules, not a zero-row instruction; validate the configuration.</p>
        {!field.required && <button type="button" disabled={selection === undefined}
          className="text-accent text-[11px] hover:underline disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded"
          onClick={() => { const next = { ...value }; delete next[field.name]; onChange(next); }}>
          Use component default
        </button>}
        {missing && <p id={`${field.name}-selection-error`} role="alert" className="text-[11px] text-destructive">A columns value is required.</p>}
      </div>
    );
  };

  const renderControl = (field: ConfigField) => {
    if (field.name === 'connection_ref') {
      return <ConnectionField key={`${tenantId}:${connectionDriver ?? ''}`} id={field.name} tenantId={tenantId} driver={connectionDriver}
        value={String(getCurrentValue(value, field) ?? '')}
        onChange={(connectionId) => {
          handleChange(field, connectionId);
          onConnectionChange?.();
        }} />;
    }
    // Convention-based discovery rendering: a field named "table" becomes a
    // dropdown when tables are available; "columns" becomes a checkbox group.
    if (field.name === 'table') return renderTableField(field);
    if (field.name === 'columns' && field.type === 'STRING') return renderColumnsField(field);
    if (field.name === 'columns' && field.type === 'ARRAY' && !field.properties?.length && columns?.length) {
      const selection = value[field.name];
      if (selection === undefined || (Array.isArray(selection)
        && selection.every((name) => typeof name === 'string') && new Set(selection).size === selection.length)) {
        return renderArrayColumnsField(field, selection);
      }
    }

    const currentValue = getCurrentValue(value, field);
    if (recordSchemaForms && field.name === 'schema' && field.type === 'OBJECT') {
      return <RecordSchemaField field={field} value={currentValue} onChange={(nextValue) => {
        const next = { ...value };
        if (nextValue === undefined) delete next[field.name];
        else next[field.name] = nextValue;
        onChange(next);
      }} />;
    }

    switch (field.type) {
      case 'OBJECT':
      case 'ARRAY':
        return (
          <StructuredField field={field} value={currentValue} onChange={(parsed) => {
            const next = { ...value };
            if (parsed === undefined) delete next[field.name];
            else next[field.name] = parsed;
            onChange(next);
          }} />
        );

      case 'STRING':
        return (
          <input
            type="text"
            id={field.name}
            value={currentValue as string}
            onChange={(e) => handleChange(field, e.target.value)}
            placeholder={field.placeholder}
            className="w-full bg-muted border border-border rounded-md h-8 px-2.5 text-xs text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        );

      case 'INTEGER':
      case 'NUMBER':
        return (
          <NumericField
            field={field}
            value={currentValue}
            onChange={(parsed) => {
              if (parsed === undefined) {
                const next = { ...value };
                delete next[field.name];
                onChange(next);
              } else {
                onChange({ ...value, [field.name]: parsed });
              }
            }}
          />
        );

      case 'BOOLEAN':
        return (
          <input
            type="checkbox"
            id={field.name}
            checked={!!currentValue}
            onChange={(e) => handleChange(field, e.target.checked)}
            className="rounded border-border bg-muted text-accent focus:ring-1 focus:ring-accent h-3.5 w-3.5"
          />
        );

      case 'SECRET':
        return (
          <input
            type="password"
            id={field.name}
            value={currentValue as string}
            onChange={(e) => handleChange(field, e.target.value)}
            placeholder={field.placeholder}
            className="w-full bg-muted border border-border rounded-md h-8 px-2.5 text-xs text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        );

      case 'ENUM':
        return (
          <select
            id={field.name}
            value={String(currentValue)}
            aria-required={field.required || undefined}
            data-config-invalid={(field.required && currentValue === '') || (currentValue !== '' && !(field.enumValues ?? []).includes(String(currentValue))) ? 'true' : undefined}
            onChange={(e) => {
              if (e.target.value !== '') handleChange(field, e.target.value);
              else {
                const updated = { ...value };
                delete updated[field.name];
                onChange(updated);
              }
            }}
            className="w-full bg-muted border border-border rounded-md h-8 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">{'\u672a\u8bbe\u7f6e'}</option>
            {currentValue !== '' && !(field.enumValues ?? []).includes(String(currentValue)) && <option value={String(currentValue)}>{String(currentValue)} ({'\u672a\u58f0\u660e'})</option>}
            {(field.enumValues ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      default:
        return <p role="alert" data-config-invalid="true" className="text-xs text-destructive">Unsupported field type {String(field.type)}. Use Raw JSON for this component.</p>;
    }
  };

  return (
    <div className="space-y-1.5">
      {schema.fields.map((field) => {
        const labelText = field.label || field.name;
        return (
          <div key={field.name} className="flex items-center gap-2">
            <label
              htmlFor={field.name}
              title={field.description || labelText}
              className="w-24 shrink-0 text-right text-[11px] font-medium text-foreground/50 leading-5"
            >
              {labelText}
              {field.required && (
                <span className="text-destructive ml-0.5">*</span>
              )}
            </label>
            <div className="flex-1 min-w-0">
              {renderControl(field)}
            </div>
          </div>
        );
      })}
    </div>
  );
}


export function SchemaForm(props: Parameters<typeof BasicSchemaForm>[0]) {
  const fields = props.schema.fields ?? [];
  if (!fields.some(field => field.type === 'ARRAY' && field.properties?.length)) {
    return <BasicSchemaForm {...props} />;
  }
  const primary = fields.filter(field => field.required || (field.type === 'ARRAY' && field.properties?.length));
  const optional = fields.filter(field => !primary.includes(field));
  return <div className="space-y-4">{primary.map(field => {
    const single = { ...props, schema: { ...props.schema, fields: [field] } };
    if (field.type !== 'ARRAY' || !field.properties?.length) return <BasicSchemaForm key={field.name} {...single} />;
    return <StructuredArrayField key={field.name} field={field} value={props.value[field.name]} fallback={<BasicSchemaForm {...single} />} onChange={next => {
      const updated = { ...props.value };
      if (next === undefined) delete updated[field.name];
      else updated[field.name] = next;
      props.onChange(updated);
    }} />;
  })}{optional.length > 0 && <details className="structured-config-options">
    <summary>{'\u5176\u4ed6\u914d\u7f6e'} ({optional.length})</summary>
    <BasicSchemaForm {...props} schema={{ ...props.schema, fields: optional }} />
  </details>}</div>;
}

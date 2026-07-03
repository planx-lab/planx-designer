import type { ConfigSchema, ConfigField, TableInfo, ColumnInfo } from '@/types/plugin';

interface SchemaFormProps {
  schema: ConfigSchema;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
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
    case 'BOOLEAN':
      return field.defaultValue.boolValue;
  }
}

function getCurrentValue(value: Record<string, unknown>, field: ConfigField): unknown {
  if (field.name in value) return value[field.name];
  return getDefaultValue(field) ?? '';
}

export function SchemaForm({
  schema,
  value,
  onChange,
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
    if (!tables || tables.length === 0) {
      return (
        <input
          type="text"
          id={field.name}
          value={currentValue}
          onChange={(e) => handleChange(field, e.target.value)}
          placeholder={field.placeholder ?? 'schema.table'}
          className="w-full bg-muted border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent"
        />
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <select
          id={field.name}
          value={currentValue}
          onChange={(e) => {
            handleChange(field, e.target.value);
            onTableChange?.(e.target.value);
          }}
          className="flex-1 bg-muted border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {tables.map((t) => (
            <option key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>
              {t.schema}.{t.name}
            </option>
          ))}
        </select>
        {onDiscoverTables && (
          <button
            type="button"
            onClick={onDiscoverTables}
            disabled={loadingDiscovery}
            className="shrink-0 bg-accent hover:bg-accent/80 text-white rounded-md text-[10px] px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
          className="w-full bg-muted border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent"
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

  const renderControl = (field: ConfigField) => {
    // Convention-based discovery rendering: a field named "table" becomes a
    // dropdown when tables are available; "columns" becomes a checkbox group.
    if (field.name === 'table') return renderTableField(field);
    if (field.name === 'columns') return renderColumnsField(field);

    const currentValue = getCurrentValue(value, field);

    switch (field.type) {
      case 'STRING':
        return (
          <input
            type="text"
            id={field.name}
            value={currentValue as string}
            onChange={(e) => handleChange(field, e.target.value)}
            placeholder={field.placeholder}
            className="w-full bg-muted border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        );

      case 'INTEGER':
        return (
          <input
            type="number"
            id={field.name}
            value={currentValue as number | ''}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              if (Number.isNaN(parsed)) {
                const next = { ...value };
                delete next[field.name];
                onChange(next);
              } else {
                onChange({ ...value, [field.name]: parsed });
              }
            }}
            placeholder={field.placeholder}
            className="w-full bg-muted border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent"
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
            className="w-full bg-muted border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        );

      case 'ENUM':
        return (
          <select
            id={field.name}
            value={currentValue as string}
            onChange={(e) => handleChange(field, e.target.value)}
            className="w-full bg-muted border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {(field.enumValues ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
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

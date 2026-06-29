import type { ConfigSchema, ConfigField } from '@/types/plugin';

interface SchemaFormProps {
  schema: ConfigSchema;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
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

export function SchemaForm({ schema, value, onChange }: SchemaFormProps) {
  if (schema.fields.length === 0) {
    return null;
  }

  const handleChange = (field: ConfigField, newValue: unknown) => {
    onChange({ ...value, [field.name]: newValue });
  };

  const renderControl = (field: ConfigField) => {
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
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-accent"
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
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        );

      case 'BOOLEAN':
        return (
          <input
            type="checkbox"
            id={field.name}
            checked={!!currentValue}
            onChange={(e) => handleChange(field, e.target.checked)}
            className="rounded border-border bg-muted text-accent focus:ring-1 focus:ring-accent"
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
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        );

      case 'ENUM':
        return (
          <select
            id={field.name}
            value={currentValue as string}
            onChange={(e) => handleChange(field, e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
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
    <div className="space-y-4">
      {schema.fields.map((field) => {
        const labelText = field.label || field.name;
        return (
          <div key={field.name}>
            <label
              htmlFor={field.name}
              className="block text-xs font-medium text-foreground/60 mb-1"
            >
              {labelText}
              {field.required && (
                <span className="text-destructive ml-0.5">*</span>
              )}
            </label>
            {field.description && (
              <p className="text-[11px] text-foreground/40 mb-1.5">
                {field.description}
              </p>
            )}
            {renderControl(field)}
          </div>
        );
      })}
    </div>
  );
}

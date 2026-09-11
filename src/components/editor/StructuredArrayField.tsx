import { useId, useRef, useState, type ReactNode } from 'react';
import { isLosslessNumber, parse, stringify } from 'lossless-json';
import type { ConfigField } from '@/types/plugin';
import './StructuredArrayField.css';

const text = {
  add: '\u6dfb\u52a0\u4e00\u9879', property: '\u6dfb\u52a0\u914d\u7f6e\u9879',
  up: '\u4e0a\u79fb', down: '\u4e0b\u79fb', remove: '\u5220\u9664', undo: '\u64a4\u9500\u5220\u9664',
  json: '\u9ad8\u7ea7 JSON', form: '\u8fd4\u56de\u8868\u5355', unset: '\u672a\u8bbe\u7f6e',
  object: '\u914d\u7f6e\u5bf9\u8c61', required: '\u5fc5\u586b',
  empty: '\u5c1a\u672a\u6dfb\u52a0\u6761\u76ee\u3002\u6dfb\u52a0\u540e\u6309\u987a\u5e8f\u914d\u7f6e\uff0c\u4ecd\u9700\u6267\u884c\u914d\u7f6e\u6821\u9a8c\u3002',
  draft: '\u8bf7\u5148\u4fee\u6b63\u672a\u4fdd\u5b58\u7684\u8f93\u5165\uff0c\u518d\u5207\u6362\u6216\u8c03\u6574\u6761\u76ee\u3002',
  shape: '\u5f53\u524d\u503c\u4e0d\u662f\u5bf9\u8c61\u5217\u8868\uff0c\u8bf7\u5728 JSON \u4e2d\u4fee\u6b63\uff1b\u539f\u503c\u5df2\u4fdd\u7559\u3002',
  number: '\u8bf7\u8f93\u5165\u6709\u6548\u6570\u503c\uff0c\u4e0d\u4f1a\u81ea\u52a8\u820d\u5165\u3002',
  integer: '\u8bf7\u8f93\u5165\u6574\u6570\uff0c\u4e0d\u4f1a\u81ea\u52a8\u622a\u65ad\u3002',
  invalid: '\u8bf7\u8f93\u5165\u4e0e\u5b57\u6bb5\u7c7b\u578b\u4e00\u81f4\u7684 JSON\u3002',
  absent: '\u8bf7\u586b\u5199\u6b64\u5fc5\u586b\u9879\u3002',
  pending: '\u8f93\u5165\u5c1a\u672a\u5e94\u7528\uff0c\u539f\u914d\u7f6e\u4fdd\u6301\u4e0d\u53d8\u3002',
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const objectList = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(object);
const label = (field: ConfigField) => field.label || field.name;

function setProperty(value: Record<string, unknown>, name: string, next: unknown) {
  const result = { ...value };
  if (next === undefined) delete result[name];
  else result[name] = next;
  return result;
}

function accepts(field: ConfigField, value: unknown): boolean {
  if (value === undefined) return true;
  switch (field.type) {
    case 'STRING': case 'SECRET': return typeof value === 'string';
    case 'INTEGER': return (typeof value === 'number' && Number.isSafeInteger(value)) || (isLosslessNumber(value) && /^-?(0|[1-9]\d*)$/.test(value.toString()));
    case 'NUMBER': return (typeof value === 'number' && Number.isFinite(value)) || isLosslessNumber(value);
    case 'BOOLEAN': return typeof value === 'boolean';
    case 'ENUM': return typeof value === 'string' && !!field.enumValues?.includes(value);
    case 'OBJECT': return object(value);
    case 'ARRAY': return Array.isArray(value);
    default: return false;
  }
}

interface ValueProps {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ValueInput({ field, value, onChange }: ValueProps) {
  const id = useId();
  const plain = field.type === 'STRING' || field.type === 'SECRET';
  const numeric = field.type === 'INTEGER' || field.type === 'NUMBER';
  const display = (v: unknown) => v === undefined ? '' : plain && typeof v === 'string' ? v : stringify(v, null, numeric ? undefined : 2) ?? '';
  const initialError = (v: unknown) => accepts(field, v) ? '' : text.invalid;
  const [draft, setDraft] = useState(() => ({ accepted: value, value: display(value), error: initialError(value) }));
  if (!Object.is(draft.accepted, value)) {
    setDraft({ accepted: value, value: display(value), error: initialError(value) });
  }
  const missing = !!field.required && value === undefined;
  const error = draft.error || (missing ? text.absent : '');
  const changeText = (input: string) => {
    let next: unknown;
    try {
      if (plain) next = input;
      else if (input === '' && !field.required) next = undefined;
      else if (field.type === 'INTEGER') {
        if (!/^-?(0|[1-9]\d*)$/.test(input)) throw new Error(text.integer);
        const n = Number(input);
        next = Number.isSafeInteger(n) ? n : parse(input);
      } else {
        if (field.type === 'NUMBER' && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(input)) throw new Error(text.number);
        next = parse(input);
        if (!accepts(field, next)) throw new Error(text.invalid);
      }
      setDraft({ accepted: next, value: input, error: '' });
      onChange(next);
    } catch (failure) {
      setDraft(current => ({ ...current, value: input, error: numeric && failure instanceof Error ? failure.message : text.invalid }));
    }
  };
  const controls = { id, 'aria-required': field.required || undefined, 'aria-invalid': !!error, 'aria-describedby': `${id}-help ${id}-error` };
  return <div className="structured-config__field" data-config-invalid={error ? 'true' : undefined} data-config-draft-invalid={draft.error ? 'true' : undefined}>
    <div className="structured-config__label"><label htmlFor={id}>{label(field)}</label>{field.required && <small>{text.required}</small>}</div>
    {(field.type === 'BOOLEAN' || field.type === 'ENUM') ? <select {...controls} value={value === undefined ? '' : String(value)} onChange={event => {
      const next = event.target.value === '' ? undefined : field.type === 'BOOLEAN' ? event.target.value === 'true' : event.target.value;
      setDraft({ accepted: next, value: next === undefined ? '' : String(next), error: '' });
      onChange(next);
    }}>
      <option value="">{text.unset}</option>
      {field.type === 'BOOLEAN' ? <><option value="true">true</option><option value="false">false</option></> : field.enumValues?.map(option => <option key={option} value={option}>{option}</option>)}
      {value !== undefined && !accepts(field, value) && <option value={String(value)}>{String(value)}</option>}
    </select> : numeric || field.type === 'SECRET' ? <input {...controls} type={field.type === 'SECRET' ? 'password' : 'text'} inputMode={numeric ? 'decimal' : undefined} autoComplete="off" value={draft.value} onChange={event => changeText(event.target.value)} /> : <textarea {...controls} rows={plain ? 2 : 4} spellCheck={false} value={draft.value} onChange={event => changeText(event.target.value)} />}
    <p id={`${id}-help`} className="structured-config__help">{field.description}</p>
    <p id={`${id}-error`} className="structured-config__error" role={error ? 'alert' : undefined}>{error}{draft.error && ` ${text.pending}`}</p>
  </div>;
}

function ObjectFields({ fields, value, onChange }: { fields: ConfigField[]; value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const available = fields.filter(field => !field.required && !Object.hasOwn(value, field.name) && !expanded.includes(field.name));
  const visible = fields.filter(field => field.required || Object.hasOwn(value, field.name) || expanded.includes(field.name));
  const unknown = Object.keys(value).filter(name => !fields.some(field => field.name === name));
  return <div className="structured-config__properties">
    <div className="structured-config__grid">{visible.map(field => <div key={field.name} className="structured-config__property">
      {field.type === 'ARRAY' && field.properties?.length && (value[field.name] === undefined || objectList(value[field.name])) ? <StructuredArrayField
        field={field} value={value[field.name]} onChange={next => onChange(setProperty(value, field.name, next))}
        fallback={<ValueInput field={field} value={value[field.name]} onChange={next => onChange(setProperty(value, field.name, next))} />} /> : field.type === 'OBJECT' && field.properties?.length && (value[field.name] === undefined || object(value[field.name])) ? <fieldset className="structured-config__object">
        <legend>{label(field)}</legend>
        {value[field.name] === undefined ? <button type="button" onClick={() => onChange(setProperty(value, field.name, {}))}>{text.object}</button> : <ObjectFields fields={field.properties} value={value[field.name] as Record<string, unknown>} onChange={next => onChange(setProperty(value, field.name, next))} />}
        {field.required && value[field.name] === undefined && <p className="structured-config__error" data-config-invalid="true" role="alert">{text.absent}</p>}
      </fieldset> : <ValueInput field={field} value={value[field.name]} onChange={next => onChange(setProperty(value, field.name, next))} />}
      {!field.required && <button type="button" className="structured-config__remove-property" aria-label={`${text.remove} ${label(field)}`} onClick={() => {
        setExpanded(current => current.filter(name => name !== field.name));
        onChange(setProperty(value, field.name, undefined));
      }}>{text.remove} {label(field)}</button>}
    </div>)}</div>
    {available.length > 0 && <select aria-label={text.property} value="" onChange={event => {
      const name = event.target.value;
      if (name) setExpanded(current => [...current, name]);
    }}><option value="">+ {text.property}</option>{available.map(field => <option key={field.name} value={field.name}>{label(field)}</option>)}</select>}
    {unknown.length > 0 && <p className="structured-config__help">{`\u5df2\u4fdd\u7559 ${unknown.length} \u4e2a\u672a\u58f0\u660e\u5b57\u6bb5\uff1a${unknown.join(', ')}\u3002\u53ef\u5728\u9ad8\u7ea7 JSON \u4e2d\u7f16\u8f91\u3002`}</p>}
  </div>;
}

export function StructuredArrayField({ field, value, onChange, fallback }: ValueProps & { fallback: ReactNode }) {
  const id = useId();
  const counter = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const newKey = () => `${id}-${counter.current++}`;
  const valid = value === undefined || objectList(value);
  const rows = objectList(value) ? value : [];
  const externalKeys = () => rows.map((_, index) => `${id}-external-${index}`);
  const [raw, setRaw] = useState(!valid);
  const [message, setMessage] = useState('');
  const [state, setState] = useState(() => ({ accepted: value, keys: externalKeys() }));
  const [removed, setRemoved] = useState<{ row: Record<string, unknown>; key: string; index: number } | null>(null);
  if (!Object.is(state.accepted, value)) {
    setState({ accepted: value, keys: externalKeys() });
    setRemoved(null);
  }
  const ready = () => {
    if (root.current?.querySelector(raw ? '[data-config-invalid="true"]' : '[data-config-draft-invalid="true"]')) {
      setMessage(text.draft);
      return false;
    }
    setMessage('');
    return true;
  };
  const commit = (next: Record<string, unknown>[], keys = state.keys) => {
    setState({ accepted: next, keys });
    setMessage('');
    onChange(next);
  };
  const move = (index: number, direction: number) => {
    if (!ready()) return;
    const next = [...rows], keys = [...state.keys], target = index + direction;
    [next[index], next[target]] = [next[target], next[index]];
    [keys[index], keys[target]] = [keys[target], keys[index]];
    commit(next, keys);
  };
  return <div ref={root} className="structured-config">
    <div className="structured-config__heading"><div><strong>{label(field)}</strong><span className="structured-config__count">{rows.length}</span></div><button type="button" onClick={() => { if (valid && ready()) setRaw(current => !current); }}>{raw ? text.form : text.json}</button></div>
    {field.description && <p className="structured-config__help">{field.description}</p>}
    {message && <p role="alert" className="structured-config__error">{message}</p>}
    {!valid && <p role="alert" className="structured-config__error" data-config-invalid="true">{text.shape}</p>}
    {raw || !valid ? fallback : <>
      {rows.length === 0 && <p className="structured-config__empty">{text.empty}</p>}
      <div className="structured-config__rows">{rows.map((row, index) => <fieldset key={state.keys[index]} className="structured-config__row">
        <legend>{`${label(field)} / ${index + 1}`}</legend>
        <div className="structured-config__actions">
          <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>{text.up}</button>
          <button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>{text.down}</button>
          <button type="button" onClick={() => {
            if (!ready()) return;
            setRemoved({ row, key: state.keys[index], index });
            commit(rows.filter((_, i) => i !== index), state.keys.filter((_, i) => i !== index));
          }}>{text.remove}</button>
        </div>
        <ObjectFields fields={field.properties ?? []} value={row} onChange={next => commit(rows.map((item, i) => i === index ? next : item))} />
      </fieldset>)}</div>
      <div className="structured-config__footer"><button type="button" className="structured-config__add" aria-label={text.add} onClick={() => { if (ready()) commit([...rows, {}], [...state.keys, newKey()]); }}>+ {text.add}</button>
        {removed && <button type="button" onClick={() => {
          if (!ready()) return;
          const next = [...rows], keys = [...state.keys], index = Math.min(removed.index, rows.length);
          next.splice(index, 0, removed.row); keys.splice(index, 0, removed.key);
          commit(next, keys); setRemoved(null);
        }}>{text.undo}</button>}
      </div>
    </>}
  </div>;
}

import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { parse, stringify } from 'lossless-json';
import { SchemaForm } from './SchemaForm';
import type { ConfigField } from '@/types/plugin';

afterEach(cleanup);

const copy = {
  add: '\u6dfb\u52a0\u4e00\u9879',
  property: '\u6dfb\u52a0\u914d\u7f6e\u9879',
  up: '\u4e0a\u79fb',
  remove: '\u5220\u9664',
  undo: '\u64a4\u9500\u5220\u9664',
  json: '\u9ad8\u7ea7 JSON',
  form: '\u8fd4\u56de\u8868\u5355',
  object: '\u914d\u7f6e\u5bf9\u8c61',
};

const properties: ConfigField[] = [
  { name: 'op', label: 'Action', type: 'ENUM', required: true, enumValues: ['copy', 'compute'] },
  { name: 'from', label: 'Input field', type: 'STRING' },
  { name: 'to', label: 'Output field', type: 'STRING' },
  { name: 'expression', label: 'CEL expression', type: 'STRING' },
  { name: 'kind', label: 'Output type', type: 'STRING' },
  { name: 'precision', label: 'Precision', type: 'INTEGER' },
  { name: 'scale', label: 'Scale', type: 'INTEGER' },
  { name: 'nullable', label: 'Nullable', type: 'BOOLEAN' },
  { name: 'threshold', label: 'Exact number', type: 'NUMBER' },
  { name: 'value', label: 'Literal', type: 'OBJECT', properties: [
    { name: 'kind', label: 'Literal type', type: 'STRING', required: true },
    { name: 'text', label: 'Literal text', type: 'STRING' },
    { name: 'null', label: 'Literal NULL', type: 'BOOLEAN' },
  ] },
];

function Form({ initial = '{}', field }: { initial?: string; field?: ConfigField }) {
  const [value, setValue] = useState(() => parse(initial) as Record<string, unknown>);
  return <>
    <SchemaForm schema={{ fields: [field ?? { name: 'operations', label: 'Operations', type: 'ARRAY', required: true, properties }] }} value={value} onChange={setValue} tenantId="reference" />
    <output aria-label="Config JSON">{stringify(value)}</output>
  </>;
}

function config() { return screen.getByLabelText('Config JSON').textContent ?? ''; }
function row(index: number, label = 'Operations') { return within(screen.getByRole('group', { name: `${label} / ${index}` })); }
function addProperty(name: string, index = 1) {
  fireEvent.change(row(index).getByRole('combobox', { name: copy.property }), { target: { value: name } });
}

it('adds a schema-driven row without inventing defaults or starting a request', () => {
  const { container } = render(<Form initial='{"unrelated":9007199254740993}' />);
  fireEvent.click(screen.getByRole('button', { name: copy.add }));
  expect(config()).toBe('{"unrelated":9007199254740993,"operations":[{}]}');
  expect(container.querySelector('[data-config-invalid="true"]')).not.toBeNull();
  fireEvent.change(row(1).getByLabelText('Action'), { target: { value: 'compute' } });
  expect(config()).toContain('"op":"compute"');
  expect(config()).not.toContain('"nullable"');
});

it('authors exact CEL mapping through advertised fields without editing JSON', () => {
  render(<Form />);
  fireEvent.click(screen.getByRole('button', { name: copy.add }));
  fireEvent.change(row(1).getByLabelText('Action'), { target: { value: 'compute' } });
  for (const [name, label, value] of [
    ['to', 'Output field', 'amount'],
    ['kind', 'Output type', 'decimal'],
    ['expression', 'CEL expression', "record.amount == null ? null : record.amount * decimal('-1')"],
    ['precision', 'Precision', '38'],
    ['scale', 'Scale', '18'],
    ['nullable', 'Nullable', 'true'],
  ]) {
    addProperty(name);
    fireEvent.change(row(1).getByLabelText(label), { target: { value } });
  }
  expect(JSON.parse(config())).toEqual({ operations: [{ op: 'compute', to: 'amount', kind: 'decimal', expression: "record.amount == null ? null : record.amount * decimal('-1')", precision: 38, scale: 18, nullable: true }] });
});

it('preserves unknown values and exact numbers when changing one nested field', () => {
  render(<Form initial='{"outside":9223372036854775807,"operations":[{"op":"compute","to":"old","threshold":12345678901234567890.123456789012345678,"vendor":{"present":null,"amount":9007199254740993}}]}' />);
  fireEvent.change(row(1).getByLabelText('Output field'), { target: { value: 'amount' } });
  expect(config()).toContain('"outside":9223372036854775807');
  expect(config()).toContain('"threshold":12345678901234567890.123456789012345678');
  expect(config()).toContain('"vendor":{"present":null,"amount":9007199254740993}');
  expect(config()).toContain('"to":"amount"');
});

it('keeps a malformed numeric draft visible and blocks a mode switch rather than applying it', () => {
  const { container } = render(<Form initial='{"operations":[{"op":"compute","precision":38}]}' />);
  fireEvent.change(row(1).getByLabelText('Precision'), { target: { value: '38x' } });
  expect(config()).toContain('"precision":38');
  expect(container.querySelector('[data-config-invalid="true"]')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: copy.json }));
  expect(row(1).getByLabelText('Precision')).toHaveValue('38x');
  fireEvent.change(row(1).getByLabelText('Precision'), { target: { value: '37' } });
  expect(config()).toContain('"precision":37');
});

it('writes a newly entered exact decimal without binary floating-point conversion', () => {
  render(<Form initial='{"operations":[{"op":"compute"}]}' />);
  addProperty('threshold');
  fireEvent.change(row(1).getByLabelText('Exact number'), { target: { value: '99999999999999999999.999999999999999999' } });
  expect(config()).toContain('"threshold":99999999999999999999.999999999999999999');
});

it('distinguishes an unset optional boolean, false, and empty string', () => {
  render(<Form initial='{"operations":[{"op":"copy","to":"amount"}]}' />);
  addProperty('nullable');
  expect(config()).not.toContain('nullable');
  fireEvent.change(row(1).getByLabelText('Nullable'), { target: { value: 'false' } });
  expect(config()).toContain('"nullable":false');
  fireEvent.change(row(1).getByLabelText('Nullable'), { target: { value: '' } });
  expect(config()).not.toContain('nullable');
  fireEvent.change(row(1).getByLabelText('Output field'), { target: { value: '' } });
  expect(config()).toContain('"to":""');
});

it('reorders and undoes deletion without changing row contents or control identity', () => {
  render(<Form initial='{"operations":[{"op":"copy","to":"first"},{"op":"compute","to":"second"}]}' />);
  const second = row(2).getByLabelText('Output field');
  fireEvent.click(row(2).getByRole('button', { name: copy.up }));
  expect(row(1).getByLabelText('Output field')).toBe(second);
  expect(JSON.parse(config()).operations.map((x: { to: string }) => x.to)).toEqual(['second', 'first']);
  fireEvent.click(row(1).getByRole('button', { name: copy.remove, exact: true }));
  expect(JSON.parse(config()).operations).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: copy.undo }));
  expect(JSON.parse(config()).operations.map((x: { to: string }) => x.to)).toEqual(['second', 'first']);
});

it('renders composite Lookup keys from metadata with unique label targets', () => {
  render(<Form initial='{"keys":[{"source":"tenant_key","column":"tenant_key","kind":"string"},{"source":"dimension_key","column":"dimension_key","kind":"int64"}]}' field={{ name: 'keys', label: 'Lookup keys', type: 'ARRAY', required: true, properties: [
    { name: 'source', label: 'Input', type: 'STRING', required: true },
    { name: 'column', label: 'Column', type: 'STRING', required: true },
    { name: 'kind', label: 'Kind', type: 'STRING', required: true },
  ] }} />);
  const columns = screen.getAllByLabelText('Column');
  expect(columns).toHaveLength(2);
  expect(new Set(columns.map(input => input.id)).size).toBe(2);
  fireEvent.change(row(2, 'Lookup keys').getByLabelText('Column'), { target: { value: 'product_key' } });
  expect(JSON.parse(config()).keys[0].column).toBe('tenant_key');
  expect(JSON.parse(config()).keys[1].column).toBe('product_key');
});

it('edits a nested typed literal without conflating empty text and NULL', () => {
  render(<Form initial='{"operations":[{"op":"compute"}]}' />);
  addProperty('value');
  fireEvent.click(row(1).getByRole('button', { name: copy.object }));
  fireEvent.change(row(1).getByLabelText('Literal type'), { target: { value: 'string' } });
  const literal = within(row(1).getByRole('group', { name: 'Literal' }));
  fireEvent.change(literal.getByRole('combobox', { name: copy.property }), { target: { value: 'text' } });
  fireEvent.change(literal.getByLabelText('Literal text'), { target: { value: 'x' } });
  fireEvent.change(literal.getByLabelText('Literal text'), { target: { value: '' } });
  expect(JSON.parse(config()).operations[0].value).toEqual({ kind: 'string', text: '' });
  fireEvent.change(literal.getByRole('combobox', { name: copy.property }), { target: { value: 'null' } });
  fireEvent.change(literal.getByLabelText('Literal NULL'), { target: { value: 'true' } });
  expect(JSON.parse(config()).operations[0].value.null).toBe(true);
});

it('retains JSON fallback for an undeclared item shape', () => {
  render(<Form initial='{"columns":["id","amount"]}' field={{ name: 'columns', label: 'Columns', type: 'ARRAY' }} />);
  expect(screen.getByLabelText('Columns')).toHaveValue('[\n  "id",\n  "amount"\n]');
  expect(screen.queryByRole('button', { name: copy.add })).not.toBeInTheDocument();
});

it('never replaces a malformed existing object-list value with an empty list', () => {
  render(<Form initial='{"operations":[null,9007199254740993]}' />);
  expect(config()).toBe('{"operations":[null,9007199254740993]}');
  expect(screen.queryByRole('button', { name: copy.add })).not.toBeInTheDocument();
  expect(screen.getByLabelText(/^Operations/)).toBeInTheDocument();
});

it('keeps required configuration and row editing before optional tuning without applying defaults', () => {
  const { container } = render(<SchemaForm schema={{ fields: [
    { name: 'max_rows', label: 'Row limit', type: 'INTEGER' },
    { name: 'resource_version', label: 'Version', type: 'STRING', required: true },
    { name: 'operations', label: 'Operations', type: 'ARRAY', required: true, properties },
  ] }} value={{}} onChange={() => {}} />);
  const tuning = container.querySelector('details.structured-config-options');
  expect(tuning).not.toBeNull();
  expect(tuning).not.toHaveAttribute('open');
  expect(tuning).toContainElement(screen.getByLabelText('Row limit'));
  expect(tuning).not.toContainElement(screen.getByRole('button', { name: copy.add }));
  expect(tuning).not.toContainElement(screen.getByLabelText(/^Version/));
});

it('shows an absent required enum as unset rather than the first advertised choice', () => {
  const { container } = render(<Form field={{ name: 'mode', label: 'Mode', type: 'ENUM', required: true, enumValues: ['snapshot', 'batch'] }} />);
  expect(screen.getByRole('combobox', { name: /^Mode/ })).toHaveValue('');
  expect(config()).toBe('{}');
  expect(container.querySelector('[data-config-invalid="true"]')).not.toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: /^Mode/ }), { target: { value: 'snapshot' } });
  expect(config()).toBe('{"mode":"snapshot"}');
});

it('honors an explicitly advertised enum default without adding it to config on render', () => {
  render(<Form field={{ name: 'mode', label: 'Mode', type: 'ENUM', enumValues: ['snapshot', 'batch'], defaultValue: { stringValue: 'batch' } }} />);
  expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveValue('batch');
  expect(config()).toBe('{}');
});

it('preserves an unknown enum and marks it invalid instead of visually selecting a valid one', () => {
  const { container } = render(<Form initial='{"mode":"retired"}' field={{ name: 'mode', label: 'Mode', type: 'ENUM', enumValues: ['snapshot', 'batch'] }} />);
  expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveValue('retired');
  expect(config()).toBe('{"mode":"retired"}');
  expect(container.querySelector('[data-config-invalid="true"]')).not.toBeNull();
});

it('removes an optional enum on explicit unset without changing other exact config', () => {
  render(<Form initial='{"mode":"batch","id":9007199254740993}' field={{ name: 'mode', label: 'Mode', type: 'ENUM', enumValues: ['snapshot', 'batch'] }} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), { target: { value: '' } });
  expect(config()).toBe('{"id":9007199254740993}');
});

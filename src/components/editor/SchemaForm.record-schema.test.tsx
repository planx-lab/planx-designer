import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SchemaForm } from './SchemaForm';
import { parseJson, stringifyJson } from '@/lib/json';

afterEach(cleanup);
function Form({ initial = {} }: { initial?: Record<string, unknown> }) {
  const [config, setConfig] = useState(initial);
  return <><SchemaForm recordSchemaForms schema={{ fields: [{ name: 'schema', type: 'OBJECT', label: 'record.Schema' }] }} value={config} onChange={setConfig} />
    <output aria-label="Saved config">{stringifyJson(config)}</output></>;
}
const saved = () => parseJson(screen.getByLabelText('Saved config').textContent!) as Record<string, unknown>;

it('authors typed fields in the workbench without guessing from a sample or changing omitted metadata', () => {
  render(<Form />); expect(saved()).toEqual({});
  fireEvent.click(screen.getByRole('button', { name: '添加一项', exact: true }));
  fireEvent.change(screen.getByLabelText('字段名称'), { target: { value: 'id' } });
  fireEvent.change(screen.getByLabelText('数据类型'), { target: { value: 'int64' } });
  expect(saved()).toEqual({ schema: { fields: [{ name: 'id', kind: 'int64' }] } });
  expect(screen.getByText(/不会从首条样本推断完整 Schema/)).toBeInTheDocument();
});

it('edits Decimal, nullability and timePrecision while preserving unknowns and exact values', () => {
  const initial = parseJson('{"other":9007199254740993,"schema":{"extension":123456789.012345678900,"fields":[{"name":"amount","kind":"decimal","nullable":false,"precision":38,"scale":18,"unknown":9007199254740993},{"name":"instant","kind":"timestamp","nullable":true,"timePrecision":0}]}}') as Record<string, unknown>;
  render(<Form initial={initial} />);
  const amount = within(screen.getByRole('group', { name: '字段 / 1' }));
  fireEvent.change(amount.getByLabelText('Decimal scale'), { target: { value: '17' } });
  fireEvent.change(amount.getByLabelText('可空 nullable'), { target: { value: 'true' } });
  const instant = within(screen.getByRole('group', { name: '字段 / 2' }));
  expect(instant.getByLabelText('时间精度 timePrecision')).toHaveValue('0');
  fireEvent.change(instant.getByLabelText('时间精度 timePrecision'), { target: { value: '' } });
  expect(screen.getByLabelText('Saved config').textContent).toContain('"other":9007199254740993');
  expect(screen.getByLabelText('Saved config').textContent).toContain('"extension":123456789.012345678900');
  expect(screen.getByLabelText('Saved config').textContent).toContain('"unknown":9007199254740993');
  expect(saved()).toMatchObject({ schema: { fields: [{ scale: 17, nullable: true }, { name: 'instant' }] } });
  expect(screen.getByLabelText('Saved config').textContent).not.toContain('timePrecision');
});

it('recursively edits struct fields and list element metadata with raw fallback', () => {
  render(<Form initial={{ schema: { fields: [{ name: 'nested', kind: 'struct', fields: [
    { name: 'list', kind: 'list', element: { name: 'item', kind: 'datetime', nullable: false, timePrecision: 6 } },
  ] }] } }} />);
  fireEvent.change(screen.getByLabelText('时间精度 timePrecision'), { target: { value: '9' } });
  expect(saved()).toMatchObject({ schema: { fields: [{ fields: [{ element: { timePrecision: 9 } }] }] } });
  fireEvent.click(screen.getByRole('button', { name: 'Schema 高级 JSON' }));
  expect(screen.getByLabelText('record.Schema').tagName).toBe('TEXTAREA');
  fireEvent.click(screen.getByRole('button', { name: 'Schema 字段表单' }));
  expect(screen.getByLabelText('时间精度 timePrecision')).toHaveValue('9');
});

it('retains invalid numeric drafts and prevents switching away or sampling stale config', () => {
  render(<Form initial={{ schema: { fields: [{ name: 'time', kind: 'timestamp', timePrecision: 6 }] } }} />);
  fireEvent.change(screen.getByLabelText('时间精度 timePrecision'), { target: { value: '1.' } });
  expect(screen.getByLabelText('时间精度 timePrecision')).toHaveValue('1.');
  expect(saved()).toMatchObject({ schema: { fields: [{ timePrecision: 6 }] } });
  expect(document.querySelector('[data-config-draft-invalid="true"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Schema 高级 JSON' }));
  expect(screen.getByLabelText('时间精度 timePrecision')).toHaveValue('1.');
});

it('keeps unknown schema shapes in raw JSON without inventing fields', () => {
  render(<Form initial={{ schema: { fields: 'unknown-shape', extension: true } }} />);
  expect(screen.getByLabelText('record.Schema').tagName).toBe('TEXTAREA');
  expect(saved()).toEqual({ schema: { fields: 'unknown-shape', extension: true } });
});

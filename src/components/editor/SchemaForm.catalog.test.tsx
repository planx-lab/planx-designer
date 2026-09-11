import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { stringify } from 'lossless-json';
import { getExecution, getPlugins } from '@/api/controlPlane';
import { SchemaForm } from './SchemaForm';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function catalog() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ plugins: [{
    id: 'fixture', components: [{ id: 'source', configSchema: { fields: [
      { name: 'schema', type: 7, properties: [{ name: 'fields', type: 8, properties: [{ name: 'kind', type: 6, enum_values: ['int64', 'decimal'] }] }] },
      { name: 'columns', type: 8 },
      { name: 'ratio', type: 3 },
      { name: 'write_mode', type: 6, enum_values: ['create', 'append'], default: { string_value: 'append' } },
      { name: 'header', type: 4, default: { bool_value: true } },
      { name: 'batch_rows', type: 2, default: { int_value: 3 } },
    ] } }],
  }] }))));
  const [plugin] = await getPlugins();
  return plugin.components[0].configSchema!;
}

it('preserves all protocol types, nested metadata, enum values and defaults', async () => {
  const schema = await catalog();
  expect(schema.fields.map(f => f.type)).toEqual(['OBJECT', 'ARRAY', 'NUMBER', 'ENUM', 'BOOLEAN', 'INTEGER']);
  expect(schema.fields[0]).toMatchObject({ properties: [{ type: 'ARRAY', properties: [{ type: 'ENUM', enumValues: ['int64', 'decimal'] }] }] });
  render(<SchemaForm schema={schema} value={{}} onChange={() => {}} />);
  expect(screen.getByLabelText('write_mode')).toHaveValue('append');
  expect(screen.getByLabelText('header')).toBeChecked();
  expect(screen.getByLabelText('batch_rows')).toHaveValue('3');
});

it('submits schema objects instead of escaped JSON strings', async () => {
  const onChange = vi.fn();
  render(<SchemaForm schema={await catalog()} value={{ path: 'source.csv' }} onChange={onChange} />);
  const input = screen.getByLabelText('schema');
  expect(input.tagName).toBe('TEXTAREA');
  fireEvent.change(input, { target: { value: '{"fields":[{"name":"id","kind":"int64","nullable":false}]}' } });
  expect(onChange).toHaveBeenCalledWith({ path: 'source.csv', schema: { fields: [{ name: 'id', kind: 'int64', nullable: false }] } });
});

it('keeps ARRAY columns as an array rather than the legacy comma-separated field', async () => {
  const onChange = vi.fn();
  render(<SchemaForm schema={await catalog()} value={{}} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('columns'), { target: { value: '["id","amount"]' } });
  expect(onChange).toHaveBeenCalledWith({ columns: ['id', 'amount'] });
});

it('retains exact numeric literals in structured fields and NUMBER inputs', async () => {
  const onChange = vi.fn();
  render(<SchemaForm schema={await catalog()} value={{}} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('schema'), { target: { value: '{"counter":9007199254740993,"decimal":0.123456789012345678901}' } });
  expect(stringify(onChange.mock.calls[0][0])).toBe('{"schema":{"counter":9007199254740993,"decimal":0.123456789012345678901}}');
  fireEvent.change(screen.getByLabelText('ratio'), { target: { value: '0.123456789012345678901' } });
  expect(stringify(onChange.mock.calls[1][0])).toBe('{"ratio":0.123456789012345678901}');
});

it.each(['{', '[]', 'null', '9007199254740993'])('does not apply invalid OBJECT draft %s', async draft => {
  const onChange = vi.fn();
  render(<SchemaForm schema={await catalog()} value={{ schema: { fields: [] } }} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('schema'), { target: { value: draft } });
  expect(screen.getByLabelText('schema')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('schema')).toHaveAttribute('data-config-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent(/not applied/i);
  expect(onChange).not.toHaveBeenCalled();
});

it('removes an optional structured field when cleared instead of fabricating an object', async () => {
  const onChange = vi.fn();
  render(<SchemaForm schema={await catalog()} value={{ schema: { fields: [] }, path: 'source.csv' }} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('schema'), { target: { value: '' } });
  expect(onChange).toHaveBeenCalledWith({ path: 'source.csv' });
});

it('adapts the actual execution id response without rounding progress', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"id":"exec-real","tenantId":"tenant-a","pipelineId":"p","status":"SUCCEEDED","progress":{"sourceDeliveries":9007199254740993}}')));
  const result = await getExecution('exec-real', 'tenant-a');
  expect(result.executionId).toBe('exec-real');
  expect(result.status).toBe('succeeded');
  expect(String(result.progress!.sourceDeliveries)).toBe('9007199254740993');
});

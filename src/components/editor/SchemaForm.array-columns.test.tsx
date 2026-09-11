import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { parse, stringify } from 'lossless-json';
import type { ColumnInfo, ConfigField } from '@/types/plugin';
import { SchemaForm } from './SchemaForm';

afterEach(cleanup);

const description = 'Ordered selected columns; defaults to all source columns or batch schema fields. Selected missing values fail, never become NULL. Unselected insert columns are omitted for database defaults/identity/generated rules; unselected update columns remain unchanged.';
const field: ConfigField = { name: 'columns', type: 'ARRAY', label: 'Columns', description };
const discovered: ColumnInfo[] = [
  { name: 'id', type: 'bigint', nullable: false },
  { name: 'category', type: 'text', nullable: false },
];

function Form({ initial = {}, columns = discovered, configField = field, onChange = () => {} }: {
  initial?: Record<string, unknown>;
  columns?: ColumnInfo[];
  configField?: ConfigField;
  onChange?: (value: Record<string, unknown>) => void;
}) {
  const [value, setValue] = useState(initial);
  return <>
    <SchemaForm schema={{ fields: [configField] }} value={value} columns={columns}
      onChange={(next) => { setValue(next); onChange(next); }} />
    <output aria-label="Config JSON">{stringify(value)}</output>
  </>;
}

const checkbox = (name: string) => screen.getByRole('checkbox', { name, exact: true });

describe('SchemaForm discovered ARRAY columns', () => {
  it('uses actual column candidates without selecting all or mutating on mount', () => {
    const onChange = vi.fn();
    render(<Form onChange={onChange} />);
    expect(checkbox('id')).not.toBeChecked();
    expect(checkbox('category')).not.toBeChecked();
    expect(screen.getByText('bigint')).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.getByText('No explicit column list is configured.')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Config JSON')).toHaveTextContent('{}');

    fireEvent.click(checkbox('category'));
    fireEvent.click(checkbox('id'));
    expect(onChange).toHaveBeenLastCalledWith({ columns: ['category', 'id'] });
    expect(checkbox('category').closest('label')).toHaveTextContent('#1');
    expect(checkbox('id').closest('label')).toHaveTextContent('#2');
  });

  it('preserves exact column names, existing order and unrelated lossless values', () => {
    const special = ' Amount, "raw" ';
    const numericName = '9007199254740993';
    const initial = parse('{"columns":["category","retired, column","id"],"amount":123456789.012345678900,"count":9007199254740993}') as Record<string, unknown>;
    const onChange = vi.fn();
    render(<Form initial={initial} onChange={onChange}
      columns={[...discovered, { name: special, type: 'numeric', nullable: true }, { name: numericName, type: 'text', nullable: false }]} />);
    const specialCheckbox = screen.getByRole('checkbox', { name: 'Amount, "raw"', exact: true });
    expect(specialCheckbox).toHaveAttribute('aria-label', special);
    fireEvent.click(specialCheckbox);
    fireEvent.click(checkbox(numericName));
    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next.columns).toEqual(['category', 'retired, column', 'id', special, numericName]);
    expect(stringify(next.amount)).toBe('123456789.012345678900');
    expect(stringify(next.count)).toBe('9007199254740993');
    expect(initial.columns).toEqual(['category', 'retired, column', 'id']);
  });

  it('retains unknown selections on other edits and removes them only explicitly', () => {
    const onChange = vi.fn();
    render(<Form initial={{ columns: ['retired, column', 'category'] }} onChange={onChange} />);
    expect(checkbox('retired, column')).toBeChecked();
    expect(checkbox('retired, column').closest('label')).toHaveTextContent('Not in current discovery');
    fireEvent.click(checkbox('id'));
    expect(onChange).toHaveBeenLastCalledWith({ columns: ['retired, column', 'category', 'id'] });
    fireEvent.click(checkbox('retired, column'));
    expect(onChange).toHaveBeenLastCalledWith({ columns: ['category', 'id'] });
  });

  it('explicitly restores optional component defaults by deleting only the field', () => {
    const onChange = vi.fn();
    render(<Form initial={{ columns: ['category'], table: 'public.dimension', keep: true }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use component default', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith({ table: 'public.dimension', keep: true });
    expect(onChange.mock.calls.at(-1)?.[0]).not.toHaveProperty('columns');
    expect(checkbox('category')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Use component default', exact: true })).toBeDisabled();
  });

  it.each([false, true])('allows explicit last deselection without inventing minItems (required=%s)', (required) => {
    const onChange = vi.fn();
    render(<Form initial={{ columns: ['id'], keep: 'retained' }} configField={{ ...field, required }} onChange={onChange} />);
    expect(checkbox('id')).toBeEnabled();
    fireEvent.click(checkbox('id'));
    expect(onChange).toHaveBeenLastCalledWith({ columns: [], keep: 'retained' });
    expect(screen.getByText('Explicit empty array ([]).')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Columns', exact: true })).not.toHaveAttribute('data-config-invalid', 'true');
    expect(screen.getByText(/not a zero-row instruction/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use component default', exact: true }) === null).toBe(required);
  });

  it('keeps required absence invalid without claiming an empty array is invalid', () => {
    const onChange = vi.fn();
    render(<Form configField={{ ...field, required: true }} onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Columns', exact: true })).toHaveAttribute('data-config-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('A columns value is required.');
    expect(screen.queryByRole('button', { name: 'Use component default', exact: true })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(checkbox('id'));
    fireEvent.click(checkbox('id'));
    expect(onChange).toHaveBeenLastCalledWith({ columns: [] });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retains an existing explicit empty array without replacing it with defaults', () => {
    const onChange = vi.fn();
    render(<Form initial={{ columns: [] }} onChange={onChange} />);
    expect(screen.getByText('Explicit empty array ([]).')).toBeInTheDocument();
    expect(checkbox('id')).not.toBeChecked();
    expect(checkbox('category')).not.toBeChecked();
    expect(screen.getByLabelText('Config JSON')).toHaveTextContent('{"columns":[]}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'comma-separated string', raw: 'id,category' },
    { label: 'JSON-encoded string', raw: '["id"]' },
    { label: 'null', raw: null },
    { label: 'object', raw: { name: 'id' } },
    { label: 'mixed array', raw: ['id', 900] },
    { label: 'object array', raw: [{ name: 'id' }] },
    { label: 'duplicate names', raw: ['id', 'id'] },
    { label: 'lossless number', raw: parse('9007199254740993') },
  ])('keeps the existing raw fallback for $label without coercion', ({ raw }) => {
    const onChange = vi.fn();
    render(<Form initial={{ columns: raw }} onChange={onChange} />);
    expect(screen.getByLabelText('Columns').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Columns')).toHaveValue(stringify(raw, null, 2));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use component default', exact: true })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the current JSON fallback when there is no discovered column evidence', () => {
    const onChange = vi.fn();
    render(<Form initial={{ columns: ['category', 'id'] }} columns={[]} onChange={onChange} />);
    expect(screen.getByLabelText('Columns')).toHaveValue('[\n  "category",\n  "id"\n]');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not apply the convention to another ARRAY field', () => {
    const onChange = vi.fn();
    render(<Form initial={{ parameters: ['id'] }} configField={{ ...field, name: 'parameters', label: 'Parameters' }} onChange={onChange} />);
    expect(screen.getByLabelText('Parameters').tagName).toBe('TEXTAREA');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not replace an ARRAY schema declaring object properties', () => {
    const onChange = vi.fn();
    render(<Form initial={{ columns: [{ value: 'id' }] }}
      configField={{ ...field, properties: [{ name: 'value', type: 'STRING' }] }} onChange={onChange} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use component default', exact: true })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Config JSON')).toHaveTextContent('{"columns":[{"value":"id"}]}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('drops obsolete candidates when discovery clears while preserving configured selections', () => {
    const onChange = vi.fn();
    const initial = { columns: ['category', 'id'] };
    const { rerender } = render(<Form initial={initial} onChange={onChange} />);
    expect(checkbox('category')).toBeChecked();
    rerender(<Form initial={initial} columns={[]} onChange={onChange} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Columns')).toHaveValue('[\n  "category",\n  "id"\n]');
    rerender(<Form initial={initial} columns={[{ name: 'new_field', type: 'uuid', nullable: false }]} onChange={onChange} />);
    expect(checkbox('category')).toBeChecked();
    expect(checkbox('category').closest('label')).toHaveTextContent('Not in current discovery');
    expect(checkbox('new_field')).not.toBeChecked();
    expect(screen.queryByText('bigint')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Config JSON')).toHaveTextContent('{"columns":["category","id"]}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves the existing STRING picker behavior unchanged', () => {
    const onChange = vi.fn();
    render(<Form initial={{ columns: 'id' }} configField={{ ...field, type: 'STRING' }} onChange={onChange} />);
    const choices = screen.getAllByRole('checkbox');
    expect(choices[0]).toBeChecked();
    expect(choices[0]).toBeDisabled();
    expect(choices[0]).toHaveAttribute('title', 'At least one column required');
    expect(choices[1]).not.toBeChecked();
    fireEvent.click(choices[1]);
    expect(onChange).toHaveBeenLastCalledWith({ columns: 'id,category' });
    expect(screen.queryByRole('button', { name: 'Use component default', exact: true })).not.toBeInTheDocument();
  });
});

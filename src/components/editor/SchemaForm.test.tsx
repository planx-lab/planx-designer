import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SchemaForm } from './SchemaForm';
import type { ConfigSchema } from '@/types/plugin';
import '@testing-library/jest-dom/vitest';

afterEach(cleanup);

// ── Helpers ──────────────────────────────────────────────────────────

function makeSchema(fields: ConfigSchema['fields']): ConfigSchema {
  return { fields };
}

// ── Field rendering ──────────────────────────────────────────────────

describe('SchemaForm — field rendering', () => {
  it('renders a STRING field as <input type="text"> with label', () => {
    const schema = makeSchema([
      { name: 'host', type: 'STRING', label: 'Host' },
    ]);
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} />);

    expect(screen.getByLabelText('Host')).toBeInTheDocument();
    const input = screen.getByLabelText('Host') as HTMLInputElement;
    expect(input.type).toBe('text');
  });

  it('renders an INTEGER field as <input type="number">', () => {
    const schema = makeSchema([
      { name: 'port', type: 'INTEGER' },
    ]);
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} />);

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('number');
  });

  it('renders a BOOLEAN field as <input type="checkbox">', () => {
    const schema = makeSchema([
      { name: 'tls', type: 'BOOLEAN' },
    ]);
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} />);

    const input = screen.getByRole('checkbox') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('checkbox');
  });

  it('renders a SECRET field as <input type="password">', () => {
    const schema = makeSchema([
      { name: 'api_key', type: 'SECRET' },
    ]);
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} />);

    const input = screen.getByLabelText('api_key') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('password');
  });

  it('renders an ENUM field as <select> with options', () => {
    const schema = makeSchema([
      { name: 'mode', type: 'ENUM', label: 'Mode', enumValues: ['fast', 'safe'] },
    ]);
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} />);

    const select = screen.getByLabelText('Mode') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.tagName).toBe('SELECT');
    expect(select.options).toHaveLength(2);
    expect(select.options[0].value).toBe('fast');
    expect(select.options[1].value).toBe('safe');
  });
});

// ── Value binding + onChange ─────────────────────────────────────────

describe('SchemaForm — value binding and onChange', () => {
  it('calls onChange with string value when STRING field changes', () => {
    const onChange = vi.fn();
    const schema = makeSchema([
      { name: 'host', type: 'STRING', label: 'Host' },
    ]);
    render(<SchemaForm schema={schema} value={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Host'), {
      target: { value: 'localhost' },
    });
    expect(onChange).toHaveBeenCalledWith({ host: 'localhost' });
  });

  it('calls onChange with numeric value when INTEGER field changes', () => {
    const onChange = vi.fn();
    const schema = makeSchema([
      { name: 'port', type: 'INTEGER', label: 'Port' },
    ]);
    render(<SchemaForm schema={schema} value={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Port'), {
      target: { value: '5432' },
    });
    expect(onChange).toHaveBeenCalledWith({ port: 5432 });
  });

  it('calls onChange with boolean value when BOOLEAN field changes', () => {
    const onChange = vi.fn();
    const schema = makeSchema([
      { name: 'tls', type: 'BOOLEAN', label: 'TLS' },
    ]);
    const { rerender } = render(
      <SchemaForm schema={schema} value={{ tls: false }} onChange={onChange} />,
    );

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ tls: true });
  });

  it('calls onChange with enum value when ENUM field changes', () => {
    const onChange = vi.fn();
    const schema = makeSchema([
      { name: 'mode', type: 'ENUM', label: 'Mode', enumValues: ['fast', 'safe'] },
    ]);
    render(<SchemaForm schema={schema} value={{ mode: 'fast' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Mode'), {
      target: { value: 'safe' },
    });
    expect(onChange).toHaveBeenCalledWith({ mode: 'safe' });
  });

  it('preserves other field values when one field changes', () => {
    const onChange = vi.fn();
    const schema = makeSchema([
      { name: 'host', type: 'STRING', label: 'Host' },
      { name: 'port', type: 'INTEGER', label: 'Port' },
    ]);
    render(
      <SchemaForm
        schema={schema}
        value={{ host: 'example.com', port: 8080 }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Host'), {
      target: { value: 'localhost' },
    });
    expect(onChange).toHaveBeenCalledWith({ host: 'localhost', port: 8080 });
  });
});

// ── Required + defaults + placeholder ────────────────────────────────

describe('SchemaForm — required, defaults, and placeholder', () => {
  it('shows a red asterisk for required fields', () => {
    const schema = makeSchema([
      { name: 'host', type: 'STRING', label: 'Host', required: true },
    ]);
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} />);

    const label = screen.getByText('Host');
    expect(label.closest('label')?.innerHTML).toContain('*');
    // The asterisk should be styled with a "red" / destructive color class
    const asterisk = label.closest('label')?.querySelector('.text-destructive');
    expect(asterisk).toBeInTheDocument();
  });

  it('applies default value when value is empty', () => {
    const schema = makeSchema([
      {
        name: 'host',
        type: 'STRING',
        label: 'Host',
        defaultValue: { stringValue: 'localhost' },
      },
    ]);
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} />);

    const input = screen.getByLabelText('Host') as HTMLInputElement;
    expect(input.value).toBe('localhost');
  });

  it('renders placeholder attribute on input', () => {
    const schema = makeSchema([
      { name: 'host', type: 'STRING', label: 'Host', placeholder: 'e.g. localhost' },
    ]);
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} />);

    const input = screen.getByLabelText('Host') as HTMLInputElement;
    expect(input.placeholder).toBe('e.g. localhost');
  });
});

// ── Empty schema ─────────────────────────────────────────────────────

describe('SchemaForm — empty schema', () => {
  it('renders nothing when schema has no fields', () => {
    const schema = makeSchema([]);
    const { container } = render(
      <SchemaForm schema={schema} value={{}} onChange={() => {}} />,
    );

    // Should render nothing for empty schema
    expect(container.firstChild).toBeNull();
  });
});

// ── Schema discovery: table dropdown + column checkboxes ─────────────

describe('SchemaForm — table dropdown discovery', () => {
  it('renders a <select> dropdown when tables prop is populated', () => {
    const schema = makeSchema([{ name: 'table', type: 'STRING', label: 'Table' }]);
    const tables = [
      { schema: 'public', name: 'users' },
      { schema: 'public', name: 'orders' },
    ];
    render(
      <SchemaForm schema={schema} value={{}} onChange={() => {}} tables={tables} />,
    );

    // The table field becomes a <select> (role=listbox in testing-library)
    // rather than a text input.
    const select = screen.getByLabelText('Table') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.options).toHaveLength(2);
    expect(select.options[0].value).toBe('public.users');
    expect(select.options[1].value).toBe('public.orders');
  });

  it('renders a Discover button', () => {
    const schema = makeSchema([{ name: 'table', type: 'STRING', label: 'Table' }]);
    const onDiscover = vi.fn();
    render(
      <SchemaForm
        schema={schema}
        value={{}}
        onChange={() => {}}
        tables={[{ schema: 'public', name: 'users' }]}
        onDiscoverTables={onDiscover}
      />,
    );

    const btn = screen.getByRole('button', { name: /^discover$/i });
    fireEvent.click(btn);
    expect(onDiscover).toHaveBeenCalledOnce();
  });

  it('falls back to text input for table field when no tables prop', () => {
    const schema = makeSchema([{ name: 'table', type: 'STRING', label: 'Table' }]);
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} />);

    const input = screen.getByLabelText('Table') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('text');
  });
});

describe('SchemaForm — column checkboxes discovery', () => {
  it('renders checkboxes when columns prop is populated; all checked by default', () => {
    const schema = makeSchema([{ name: 'columns', type: 'STRING', label: 'Columns' }]);
    const columns = [
      { name: 'id', type: 'integer', nullable: false },
      { name: 'email', type: 'text', nullable: true },
    ];
    render(
      <SchemaForm schema={schema} value={{}} onChange={() => {}} columns={columns} />,
    );

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(true);
    // Each checkbox label shows the column name and type.
    const idLabel = checkboxes[0].closest('label');
    const emailLabel = checkboxes[1].closest('label');
    expect(idLabel?.textContent).toMatch(/id/);
    expect(idLabel?.textContent).toMatch(/integer/);
    expect(emailLabel?.textContent).toMatch(/email/);
    expect(emailLabel?.textContent).toMatch(/text/);
  });

  it('toggling a checkbox updates the comma-separated columns value', () => {
    const onChange = vi.fn();
    const schema = makeSchema([{ name: 'columns', type: 'STRING', label: 'Columns' }]);
    const columns = [
      { name: 'id', type: 'integer', nullable: false },
      { name: 'name', type: 'text', nullable: true },
      { name: 'email', type: 'text', nullable: true },
    ];
    render(
      <SchemaForm
        schema={schema}
        value={{}}
        onChange={onChange}
        columns={columns}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // Uncheck the middle one (name)
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith({ columns: 'id,email' });
  });

  it('falls back to text input for columns field when no columns prop', () => {
    const schema = makeSchema([{ name: 'columns', type: 'STRING', label: 'Columns' }]);
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} />);

    const input = screen.getByLabelText('Columns') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('text');
  });

  it('prevents unchecking the last remaining column (locked + disabled + tooltip)', () => {
    const onChange = vi.fn();
    const schema = makeSchema([{ name: 'columns', type: 'STRING', label: 'Columns' }]);
    const columns = [
      { name: 'id', type: 'integer', nullable: false },
      { name: 'email', type: 'text', nullable: true },
    ];
    // Only "id" is checked — it is the last remaining, so it must be locked.
    const { rerender } = render(
      <SchemaForm
        schema={schema}
        value={{ columns: 'id' }}
        onChange={onChange}
        columns={columns}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // id is checked and is the only checked column -> locked.
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[0].disabled).toBe(true);
    expect(checkboxes[0].title).toBe('At least one column required');
    // email is unchecked and not locked.
    expect(checkboxes[1].checked).toBe(false);
    expect(checkboxes[1].disabled).toBe(false);

    // Clicking the locked checkbox does NOT fire onChange (guard returns early).
    fireEvent.click(checkboxes[0]);
    expect(onChange).not.toHaveBeenCalled();
    // id remains checked.
    expect(checkboxes[0].checked).toBe(true);
  });

  it('allows unchecking a column when more than one remains checked', () => {
    const onChange = vi.fn();
    const schema = makeSchema([{ name: 'columns', type: 'STRING', label: 'Columns' }]);
    const columns = [
      { name: 'id', type: 'integer', nullable: false },
      { name: 'name', type: 'text', nullable: true },
      { name: 'email', type: 'text', nullable: true },
    ];
    render(
      <SchemaForm
        schema={schema}
        value={{ columns: 'id,name,email' }}
        onChange={onChange}
        columns={columns}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // None locked: three checked, all enabled.
    expect(checkboxes.every((c) => !c.disabled)).toBe(true);

    // Uncheck the middle one -> onChange fires with the remaining two.
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith({ columns: 'id,email' });
  });
});

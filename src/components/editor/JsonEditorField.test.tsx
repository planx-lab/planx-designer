import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { parse, stringify } from 'lossless-json';
import { JsonEditorField } from './JsonEditorField';

const raw = '{"id":9007199254740993,"amount":0.123456789012345678900}';
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('keeps edited numeric tokens exact through the real CodeMirror update listener', () => {
  const onChange = vi.fn();
  const { container } = render(<JsonEditorField value={{}} onChange={onChange} />);
  const view = EditorView.findFromDOM(container.querySelector('.cm-editor')!)!;
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: raw } }));
  expect(stringify(onChange.mock.calls.at(-1)?.[0])).toBe(raw);
});

it('renders and syncs lossless numeric values without exposing wrapper objects', () => {
  const value = parse(raw) as Record<string, unknown>;
  const { container, rerender } = render(<JsonEditorField value={value} onChange={() => {}} />);
  const view = EditorView.findFromDOM(container.querySelector('.cm-editor')!)!;
  expect(view.state.doc.toString()).toBe(stringify(value, undefined, 2));
  const next = parse('{"amount":1.2300e-500}') as Record<string, unknown>;
  rerender(<JsonEditorField value={next} onChange={() => {}} />);
  expect(view.state.doc.toString()).toBe(stringify(next, undefined, 2));
});

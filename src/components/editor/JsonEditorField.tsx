import { useEffect, useRef } from 'react';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { lintGutter, linter } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { parseJson, stringifyJson } from '@/lib/json';

/**
 * CodeMirror 6 JSON editor for raw node config editing.
 *
 * Isolated into its own module so that ConfigPanel (and its unit tests) do not
 * pull CodeMirror into their module graph unless the raw-JSON editor is actually
 * rendered. CodeMirror's measurement API loops indefinitely under jsdom, which
 * previously hung the ConfigPanel test suite; this boundary keeps the test
 * environment CodeMirror-free. (Lazy rendering is enough: the component is only
 * constructed when the user toggles "Raw JSON".)
 */
export function JsonEditorField({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Keep a ref to the latest onChange so the create-effect's updateListener
  // (which has empty deps and runs once) always invokes the current callback.
  // Without this, an inline-arrow parent (e.g. onChange={(c) => doThing(c, x)})
  // would be captured once and go stale when x changes. (I1)
  const onChangeRef = useRef(onChange);
  // Update after every render (no deps array) so the listener always sees the
  // newest onChange. Done in an effect rather than during render to satisfy the
  // react-hooks/refs rule (no ref writes during render).
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        try {
          const parsed = parseJson(update.state.doc.toString()) as Record<string, unknown>;
          onChangeRef.current?.(parsed);
        } catch {
          // Invalid JSON — don't push bad state. The lint plugin
          // already shows error indicators.
        }
      }
    });

    viewRef.current = new EditorView({
      doc: stringifyJson(value, 2),
      extensions: [
        basicSetup,
        json(),
        linter(jsonParseLinter()),
        lintGutter(),
        oneDark,
        updateListener,
        EditorView.lineWrapping,
      ],
      parent: containerRef.current,
    });

    return () => viewRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    const next = stringifyJson(value, 2);
    if (current !== next) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-64 overflow-auto"
    />
  );
}

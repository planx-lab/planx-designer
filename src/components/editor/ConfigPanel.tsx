import { useEffect, useRef, useMemo, useState } from 'react';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { lintGutter, linter } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { CheckCircle, XCircle } from 'lucide-react';

import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { validateConfig } from '@/api/controlPlane';
import { SchemaForm } from './SchemaForm';

export function ConfigPanel() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const nodes = usePipelineStore((s) => s.nodes);
  const setNodeName = usePipelineStore((s) => s.setNodeName);
  const setComponent = usePipelineStore((s) => s.setComponent);
  const setConfig = usePipelineStore((s) => s.setConfig);
  const getItemsByKind = usePaletteStore((s) => s.getItemsByKind);
  const plugins = usePaletteStore((s) => s.plugins);

  const node = nodes.find((n) => n.id === selectedNodeId);

  const [showRawJson, setShowRawJson] = useState(false);
  const [validateState, setValidateState] = useState<
    { status: 'idle' } | { status: 'loading' } | { status: 'success'; message: string } | { status: 'error'; message: string }
  >({ status: 'idle' });

  // Always call useMemo before any early return to preserve hook ordering.
  const components = useMemo(
    () => (node ? getItemsByKind()[node.data.nodeType] ?? [] : []),
    [getItemsByKind, plugins, node?.data?.nodeType],
  );

  // Find the selected component's configSchema from palette plugin data.
  const configSchema = useMemo(() => {
    if (!node?.data?.pluginId) return undefined;
    const plugin = plugins.find((p) => p.id === node.data.pluginId);
    const component = plugin?.components.find(
      (c) => c.id === node.data.componentId,
    );
    return component?.configSchema;
  }, [plugins, node?.data?.pluginId, node?.data?.componentId]);

  const hasSchema = configSchema && configSchema.fields.length > 0;

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-foreground/30 text-sm text-center">
          Select a node to edit its configuration
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40">
            {node.data.nodeType}
          </span>
        </div>
        <h3 className="text-foreground font-medium truncate">
          {node.data.pluginLabel || node.data.pluginId || 'Unconfigured'}
        </h3>
        {node.data.name && (
          <p className="text-foreground/40 text-xs mt-0.5">{node.data.name}</p>
        )}
      </div>

      {/* Node settings */}
      <div className="p-4 space-y-4 border-b border-border">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-foreground/60 mb-1">
            Node Name
          </label>
          <input
            type="text"
            value={node.data.name}
            onChange={(e) => setNodeName(node.id, e.target.value)}
            placeholder="e.g. main-source"
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Component selector */}
        <div>
          <label className="block text-xs font-medium text-foreground/60 mb-1">
            Component
          </label>
          <select
            value={`${node.data.pluginId}/${node.data.componentId}`}
            onChange={(e) => {
              const [pluginId, componentId] = e.target.value.split('/');
              const item = components.find(
                (c) => c.pluginId === pluginId && c.componentId === componentId,
              );
              if (item) {
                setComponent(
                  node.id,
                  item.pluginId,
                  item.componentId,
                  item.componentDisplayName,
                );
              }
            }}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {components.map((item) => (
              <option
                key={`${item.pluginId}/${item.componentId}`}
                value={`${item.pluginId}/${item.componentId}`}
              >
                {item.pluginDisplayName} / {item.componentDisplayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Config editor */}
      <div className="flex-1 p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-foreground/60">
            Config
          </label>
          {hasSchema && (
            <button
              type="button"
              onClick={() => setShowRawJson((v) => !v)}
              className="text-accent text-xs hover:underline"
            >
              {showRawJson ? 'Schema Form' : 'Raw JSON'}
            </button>
          )}
        </div>

        {hasSchema && !showRawJson ? (
          <div className="rounded-lg border border-border p-4">
            <SchemaForm
              schema={configSchema}
              value={node.data.config}
              onChange={(config) => setConfig(node.id, config)}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <JsonEditorField
              value={node.data.config}
              onChange={(config) => setConfig(node.id, config)}
            />
          </div>
        )}

        {/* Validate Config */}
        <button
          type="button"
          disabled={validateState.status === 'loading'}
          onClick={async () => {
            setValidateState({ status: 'loading' });
            try {
              const result = await validateConfig(
                node.data.pluginId ?? '',
                node.data.componentId ?? '',
                node.data.config,
              );
              setValidateState(
                result.ok
                  ? { status: 'success', message: result.message }
                  : { status: 'error', message: result.message },
              );
            } catch {
              setValidateState({
                status: 'error',
                message: 'Validation request failed',
              });
            }
          }}
          className="bg-accent hover:bg-accent/80 text-white rounded-lg text-sm px-4 py-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
          {validateState.status === 'loading' ? 'Validating...' : 'Validate Config'}
        </button>

        {/* Validation result */}
        {validateState.status === 'success' && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-green-500">
            <CheckCircle className="w-4 h-4" />
            <span>{validateState.message}</span>
          </div>
        )}
        {validateState.status === 'error' && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-red-500">
            <XCircle className="w-4 h-4" />
            <span>{validateState.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CodeMirror 6 JSON editor (isolated to avoid unnecessary re-renders) ──

function JsonEditorField({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        try {
          const parsed = JSON.parse(update.state.doc.toString());
          onChange(parsed);
        } catch {
          // Invalid JSON — don't push bad state. The lint plugin
          // already shows error indicators.
        }
      }
    });

    viewRef.current = new EditorView({
      doc: JSON.stringify(value, null, 2),
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
    const next = JSON.stringify(value, null, 2);
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

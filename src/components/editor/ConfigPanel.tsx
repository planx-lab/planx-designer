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
import { validateConfig, discoverSchema } from '@/api/controlPlane';
import type { TableInfo, ColumnInfo } from '@/types/plugin';
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

  // Schema discovery state (ADR-013): tables list, columns list, loading flag.
  // Reset when the selected node's plugin/component changes so stale discovery
  // data from one connector doesn't leak into another.
  const [discovery, setDiscovery] = useState<{
    tables: TableInfo[];
    columns: ColumnInfo[];
    loading: boolean;
  }>({ tables: [], columns: [], loading: false });

  const pluginId = node?.data?.pluginId;
  const componentId = node?.data?.componentId;

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

  // Reset validation state when config changes
  useEffect(() => {
    setValidateState({ status: 'idle' });
  }, [node?.data?.config]);

  // Reset discovery state when the selected plugin/component changes.
  useEffect(() => {
    setDiscovery({ tables: [], columns: [], loading: false });
  }, [pluginId, componentId]);

  // Discover tables for the current connection config. Triggered by the
  // "Discover Tables" button on the table field.
  const handleDiscoverTables = async () => {
    if (!node?.data?.pluginId || !node?.data?.componentId) return;
    setDiscovery((prev) => ({ ...prev, loading: true }));
    try {
      const result = await discoverSchema(
        node.data.pluginId,
        node.data.componentId,
        node.data.config,
      );
      setDiscovery({ tables: result.tables, columns: [], loading: false });
    } catch {
      setDiscovery((prev) => ({ ...prev, loading: false }));
    }
  };

  // When the user selects a table, persist it and auto-discover columns.
  const handleTableChange = async (table: string) => {
    if (!node) return;
    setConfig(node.id, { ...node.data.config, table });
    if (!node.data.pluginId || !node.data.componentId) return;
    const connConfig = { ...node.data.config, table };
    try {
      const result = await discoverSchema(
        node.data.pluginId,
        node.data.componentId,
        connConfig,
      );
      setDiscovery((prev) => ({ ...prev, columns: result.columns }));
    } catch {
      // Keep existing columns on error; the dropdown selection still persisted.
    }
  };

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
          <label htmlFor={`node-name-${node.id}`} className="block text-xs font-medium text-foreground/60 mb-1">
            Node Name
          </label>
          <input
            id={`node-name-${node.id}`}
            type="text"
            value={node.data.name}
            onChange={(e) => setNodeName(node.id, e.target.value)}
            placeholder="e.g. main-source"
            className="w-full bg-muted border border-border h-8 px-2.5 text-xs rounded-md text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Component selector */}
        <div>
          <label htmlFor={`node-component-${node.id}`} className="block text-xs font-medium text-foreground/60 mb-1">
            Component
          </label>
          <select
            id={`node-component-${node.id}`}
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
            className="w-full bg-muted border border-border h-8 px-2.5 text-xs rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
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
          <span className="block text-xs font-medium text-foreground/60" id={`config-heading-${node.id}`}>
            Config
          </span>
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
          <div className="rounded-lg border border-border p-4" role="group" aria-labelledby={`config-heading-${node.id}`}>
            <SchemaForm
              schema={configSchema}
              value={node.data.config}
              onChange={(config) => setConfig(node.id, config)}
              tables={discovery.tables}
              columns={discovery.columns}
              onDiscoverTables={handleDiscoverTables}
              onTableChange={handleTableChange}
              loadingDiscovery={discovery.loading}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden" role="group" aria-labelledby={`config-heading-${node.id}`}>
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
            if (!node.data.pluginId || !node.data.componentId) {
              setValidateState({ status: 'error', message: 'Select a component first' });
              return;
            }
            setValidateState({ status: 'loading' });
            try {
              const result = await validateConfig(
                node.data.pluginId,
                node.data.componentId,
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
          className="bg-accent hover:bg-accent/80 text-white rounded-md text-xs px-3 py-1.5 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
          {validateState.status === 'loading' ? 'Validating...' : 'Validate Config'}
        </button>

        {/* Validation result */}
        {validateState.status === 'success' && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-accent" role="status">
            <CheckCircle className="w-4 h-4" />
            <span>{validateState.message}</span>
          </div>
        )}
        {validateState.status === 'error' && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-destructive" role="alert">
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

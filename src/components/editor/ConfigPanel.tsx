import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, XCircle, SlidersHorizontal } from 'lucide-react';

import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { validateConfig, discoverSchema } from '@/api/controlPlane';
import type { TableInfo, ColumnInfo } from '@/types/plugin';
import { SchemaForm } from './SchemaForm';
import { PluginOperationsPanel } from './PluginOperationsPanel';
import { SourcePreviewPanel } from './SourcePreviewPanel';

// Lazy-load the CodeMirror editor so the (heavy, jsdom-hostile) CodeMirror
// modules are only fetched when the user actually toggles "Raw JSON". This also
// keeps CodeMirror out of the eagerly-collected module graph for ConfigPanel's
// unit tests, which previously hung in jsdom. (JsonEditorField.tsx)
const JsonEditorField = lazy(() =>
  import('./JsonEditorField').then((m) => ({ default: m.JsonEditorField })),
);

type OperationContext = {
  nodeId: string;
  tenantId: string;
  pluginId?: string;
  componentId?: string;
  config: Record<string, unknown>;
};

export function ConfigPanel({ nodeId, showSourcePreview = true, showCompatibility = true, recordSchemaForms = false }: {
  nodeId?: string;
  showSourcePreview?: boolean;
  showCompatibility?: boolean;
  recordSchemaForms?: boolean;
} = {}) {
  const selection = useUIStore((s) => s.selectedNodeId);
  const selectedNodeId = nodeId ?? selection;
  const nodes = usePipelineStore((s) => s.nodes);
  const tenantId = usePipelineStore((s) => s.tenantId);
  const setNodeName = usePipelineStore((s) => s.setNodeName);
  const setComponent = usePipelineStore((s) => s.setComponent);
  const setConfig = usePipelineStore((s) => s.setConfig);
  const getItemsByKind = usePaletteStore((s) => s.getItemsByKind);
  const plugins = usePaletteStore((s) => s.plugins);

  const node = nodes.find((n) => n.id === selectedNodeId);

  const explicitNodeId = useRef(nodeId);
  explicitNodeId.current = nodeId;
  const mounted = useRef(false);
  const discoveryRequest = useRef<OperationContext | null>(null);
  const validationRequest = useRef<OperationContext | null>(null);

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
    error?: string;
  }>({ tables: [], columns: [], loading: false });

  const pluginId = node?.data?.pluginId;
  const componentId = node?.data?.componentId;

  const components = node ? getItemsByKind()[node.data.nodeType] ?? [] : [];

  // Use the selected component's schema and server-advertised operation hooks.
  const selectedComponent = useMemo(() => {
    if (!node?.data?.pluginId) return undefined;
    const plugin = plugins.find((p) => p.id === node.data.pluginId);
    const component = plugin?.components.find(
      (c) => c.id === node.data.componentId,
    );
    return component;
  }, [plugins, node?.data?.pluginId, node?.data?.componentId]);

  const configSchema = selectedComponent?.configSchema;
  const discoveryConnectionRef = configSchema?.fields.some(
    (field) => field.name === 'connection_ref',
  ) ? node?.data.config.connection_ref : undefined;
  const declaredDrivers = configSchema?.fields.find(
    (field) => field.name === 'driver' && field.type === 'ENUM',
  )?.enumValues ?? [];
  const configuredDriver = node?.data.config.driver;
  const connectionDriver = pluginId === 'csv' ? 'file'
    : declaredDrivers.length === 1 ? declaredDrivers[0]
      : typeof configuredDriver === 'string' && declaredDrivers.includes(configuredDriver)
        ? configuredDriver : undefined;
  const hasSchema = configSchema && configSchema.fields.length > 0;
  const hasKnownEmptySchema = !!selectedComponent && configSchema?.fields.length === 0;

  const captureContext = useCallback((): OperationContext | null => {
    const state = usePipelineStore.getState();
    const currentId = explicitNodeId.current ?? useUIStore.getState().selectedNodeId;
    const currentNode = state.nodes.find((item) => item.id === currentId);
    return currentNode ? {
      nodeId: currentNode.id, tenantId: state.tenantId,
      pluginId: currentNode.data.pluginId, componentId: currentNode.data.componentId,
      config: currentNode.data.config,
    } : null;
  }, []);

  const isCurrentContext = useCallback((expected: OperationContext) => {
    const current = captureContext();
    return mounted.current && current !== null
      && current.nodeId === expected.nodeId && current.tenantId === expected.tenantId
      && current.pluginId === expected.pluginId && current.componentId === expected.componentId
      && current.config === expected.config;
  }, [captureContext]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      discoveryRequest.current = null;
      validationRequest.current = null;
    };
  }, []);

  // A column request captures the committed table edit, so that request survives
  // this effect. Only obsolete requests lose their loading/error state.
  useEffect(() => {
    if (discoveryRequest.current && !isCurrentContext(discoveryRequest.current)) {
      discoveryRequest.current = null;
      setDiscovery((prev) => ({ ...prev, loading: false, error: undefined }));
    }
    if (validationRequest.current && !isCurrentContext(validationRequest.current)) {
      validationRequest.current = null;
      setValidateState({ status: 'idle' });
    }
  }, [selectedNodeId, pluginId, componentId, tenantId, node?.data?.config, isCurrentContext]);

  // Declared connection changes also clear raw/history edits before painting stale options.
  useLayoutEffect(() => {
    discoveryRequest.current = null;
    validationRequest.current = null;
    setDiscovery({ tables: [], columns: [], loading: false });
    setValidateState({ status: 'idle' });
  }, [selectedNodeId, pluginId, componentId, tenantId, discoveryConnectionRef]);

  const handleConnectionChange = () => {
    // Saving managed settings can keep the same resource ID.
    discoveryRequest.current = null;
    validationRequest.current = null;
    setDiscovery({ tables: [], columns: [], loading: false });
    setValidateState({ status: 'idle' });
  };

  // Discover tables for the current connection config. Triggered by the
  // "Discover Tables" button on the table field.
  const handleDiscoverTables = async () => {
    const request = captureContext();
    if (!request?.pluginId || !request.componentId) return;
    discoveryRequest.current = request;
    setDiscovery((prev) => ({ ...prev, loading: true, error: undefined }));
    const connConfig = { ...request.config };
    delete connConfig.table;
    delete connConfig.columns;
    try {
      const result = await discoverSchema(
        request.pluginId,
        request.componentId,
        connConfig,
        request.tenantId,
      );
      if (discoveryRequest.current !== request || !isCurrentContext(request)) return;
      setDiscovery({ tables: result.tables, columns: [], loading: false });
    } catch (err) {
      if (discoveryRequest.current !== request || !isCurrentContext(request)) return;
      setDiscovery((prev) => ({ ...prev, loading: false,
        error: err instanceof Error ? err.message : 'Discovery request failed',
      }));
    }
  };

  // When the user selects a table, persist it and auto-discover columns.
  const handleTableChange = async (table: string) => {
    const before = captureContext();
    if (!before) return;
    const connConfig: Record<string, unknown> = { ...before.config, table };
    delete connConfig.columns;
    setConfig(before.nodeId, connConfig);
    // setConfig may replace the object; bind to the actual committed snapshot.
    const request = captureContext();
    discoveryRequest.current = request;
    setDiscovery((prev) => ({ ...prev, columns: [], loading: false, error: undefined }));
    if (!request?.pluginId || !request.componentId) return;
    setDiscovery((prev) => ({ ...prev, loading: true }));
    try {
      const result = await discoverSchema(
        request.pluginId,
        request.componentId,
        request.config,
        request.tenantId,
      );
      if (discoveryRequest.current !== request || !isCurrentContext(request)) return;
      setDiscovery((prev) => ({ ...prev, columns: result.columns, loading: false }));
    } catch (err) {
      if (discoveryRequest.current !== request || !isCurrentContext(request)) return;
      // Do not reuse another table's columns when discovery fails.
      setDiscovery((prev) => ({ ...prev, loading: false,
        error: err instanceof Error ? err.message : 'Discovery request failed',
      }));
    }
  };

  const handleValidateConfig = async () => {
    const request = captureContext();
    validationRequest.current = request;
    if (!request?.pluginId || !request.componentId) {
      setValidateState({ status: 'error', message: 'Select a component first' });
      return;
    }
    setValidateState({ status: 'loading' });
    try {
      const result = await validateConfig(
        request.pluginId, request.componentId, request.config, request.tenantId,
      );
      if (validationRequest.current !== request || !isCurrentContext(request)) return;
      setValidateState(
        result.ok
          ? { status: 'success', message: result.message?.trim() || 'Configuration is valid. This does not test the connection.' }
          : { status: 'error', message: result.message?.trim() || 'Configuration is invalid.' },
      );
    } catch {
      if (validationRequest.current !== request || !isCurrentContext(request)) return;
      setValidateState({ status: 'error', message: 'Validation request failed' });
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
            {!components.some((item) => item.pluginId === node.data.pluginId && item.componentId === node.data.componentId) && (
              <option value={`${node.data.pluginId}/${node.data.componentId}`} disabled>
                {node.data.pluginLabel || node.data.componentId || node.data.pluginId} (metadata unavailable)
              </option>
            )}
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
          {/* Toggle between guided form (or empty-state) and raw JSON.
              Always available: power users can edit raw config even when a
              component declares no schema. */}
          <button
            type="button"
            onClick={() => setShowRawJson((v) => !v)}
            className="text-accent text-xs hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded"
          >
            {showRawJson ? (hasSchema ? 'Schema Form' : 'Done') : 'Raw JSON'}
          </button>
        </div>

        {hasSchema && !showRawJson ? (
          <div className="rounded-lg border border-border p-4" role="group" aria-labelledby={`config-heading-${node.id}`}>
            <SchemaForm
              key={`${node.id}:${tenantId}`}
              schema={configSchema}
              recordSchemaForms={recordSchemaForms}
              tenantId={tenantId}
              connectionDriver={connectionDriver}
              onConnectionChange={handleConnectionChange}
              value={node.data.config}
              onChange={(config) => setConfig(node.id, config)}
              tables={discovery.tables}
              columns={discovery.columns}
              onDiscoverTables={handleDiscoverTables}
              onTableChange={handleTableChange}
              loadingDiscovery={discovery.loading}
            />
          </div>
        ) : !hasSchema && !showRawJson ? (
          /* Only an explicitly empty schema establishes that no config is
             declared. Missing catalog metadata preserves the node and the
             raw editor without inventing a configuration conclusion. */
          <div
            className="rounded-lg border border-dashed border-border p-6 flex flex-col items-center text-center"
            role="group"
            aria-labelledby={`config-heading-${node.id}`}
          >
            <SlidersHorizontal size={22} className="text-foreground/30 mb-2" aria-hidden />
            <p className="text-sm font-medium text-foreground/80">{hasKnownEmptySchema ? 'No configuration needed' : 'Configuration schema unavailable'}</p>
            <p className="text-xs text-foreground/45 mt-1 max-w-[28ch]">
              {hasKnownEmptySchema ? <>This component runs as-is. Switch to <span className="text-foreground/70">Raw JSON</span> above if you need to pass advanced config.</>
                : 'Existing node values are preserved. Open Component Catalog and use Retry to refresh metadata, or edit Raw JSON.'}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden" role="group" aria-labelledby={`config-heading-${node.id}`}>
            <Suspense fallback={<div className="h-64" />}>
              <JsonEditorField
                value={node.data.config}
                onChange={(config) => setConfig(node.id, config)}
              />
            </Suspense>
          </div>
        )}

        {discovery.error && (
          <div role="alert" className="mt-2 text-xs text-destructive break-words whitespace-pre-wrap">
            Schema discovery failed: {discovery.error}
          </div>
        )}

        {/* Validate Config */}
        <button
          type="button"
          disabled={validateState.status === 'loading'}
          onClick={() => void handleValidateConfig()}
          className="bg-accent hover:bg-accent/80 text-accent-foreground rounded-md text-xs px-3 py-1.5 mt-4 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
        {pluginId && componentId && (
          <PluginOperationsPanel key={`${node.id}:${tenantId}:${pluginId}:${componentId}`}
            tenantId={tenantId} pluginId={pluginId} componentId={componentId}
            config={node.data.config} operations={selectedComponent?.operations} showCompatibility={showCompatibility} />
        )}
        {showSourcePreview && pluginId && componentId && selectedComponent?.kind === 'source' && (
          <SourcePreviewPanel key={`preview:${node.id}:${tenantId}:${pluginId}:${componentId}`}
            tenantId={tenantId} pluginId={pluginId} componentId={componentId}
            config={node.data.config} operations={selectedComponent.operations} />
        )}
      </div>
    </div>
  );
}

import { useCallback, useMemo, useState } from 'react';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { useConnectionRevisionStore } from '@/stores/useConnectionRevisionStore';
import { useConfigDraftGuard } from '@/hooks/useConfigDraftGuard';
import { stringifyJson } from '@/lib/json';
import { resolvePreviewPath } from '@/lib/previewPath';
import type { SourcePreviewResult } from '@/api/pluginPreview';
import { SourcePreviewPanel } from './SourcePreviewPanel';
import { PluginOperationsPanel } from './PluginOperationsPanel';

type Sample = { key: string; value: SourcePreviewResult } | undefined;

export function WorkbenchPreviewPanel({ selectedNodeId }: { selectedNodeId?: string }) {
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const tenantId = usePipelineStore((s) => s.tenantId);
  const plugins = usePaletteStore((s) => s.plugins);
  const resourceRevision = useConnectionRevisionStore((s) => s.revisions[tenantId] ?? 0);
  const invalidDraft = useConfigDraftGuard();
  const source = nodes.find((node) => node.data.nodeType === 'source');
  const selected = nodes.find((node) => node.id === selectedNodeId);
  const sourcePlugin = plugins.find((plugin) => plugin.id === source?.data.pluginId);
  const sourceComponent = sourcePlugin?.components.find((component) => component.id === source?.data.componentId);
  const selectedComponent = plugins.find((plugin) => plugin.id === selected?.data.pluginId)?.components.find((component) => component.id === selected?.data.componentId);
  const path = useMemo(() => resolvePreviewPath(nodes, edges, selectedNodeId, plugins), [nodes, edges, selectedNodeId, plugins]);
  const sourceKey = stringifyJson([tenantId, source?.id ?? null, source?.data ?? null, sourcePlugin ?? null, resourceRevision, invalidDraft]);
  const pathKey = stringifyJson([tenantId, selectedNodeId ?? null, nodes.map(({ id, data }) => ({ id, data })), edges.map(({ source, target }) => ({ source, target })), plugins, resourceRevision, invalidDraft]);
  const [sourceSample, setSourceSample] = useState<Sample>();
  const [processedSample, setProcessedSample] = useState<Sample>();
  const reportSource = useCallback((value?: SourcePreviewResult) => setSourceSample(value ? { key: sourceKey, value } : undefined), [sourceKey]);
  const reportProcessed = useCallback((value?: SourcePreviewResult) => setProcessedSample(value ? { key: pathKey, value } : undefined), [pathKey]);
  const supported = !('error' in path);
  const direct = supported && path.processors.length === 0;
  const sample = direct ? sourceSample?.key === sourceKey ? sourceSample.value : undefined : processedSample?.key === pathKey ? processedSample.value : undefined;
  const inputSchema = supported && !invalidDraft && (direct ? sample?.scope === undefined : sample?.scope === 'processed') ? sample?.batch.schema : undefined;
  const processors = supported ? path.processors.map((node) => ({ pluginId: node.data.pluginId, componentId: node.data.componentId, config: node.data.config })) : [];
  const blockedReason = 'error' in path ? path.error : undefined;

  return <>
    {source && <>
      <p className="workbench-source-label">来源：<strong>{source.data.name || source.data.pluginLabel}</strong></p>
      <SourcePreviewPanel key={source.id} tenantId={tenantId} pluginId={source.data.pluginId} componentId={source.data.componentId}
        config={source.data.config} operations={sourceComponent?.operations} contextKey={sourceKey} onResult={reportSource} />
      {direct ? <p className="workbench-evidence-boundary">来源直接连接当前目标，没有处理节点。目标兼容性可使用上方显式读取的当前来源 Schema。</p> : <>
        {supported && <p className="workbench-source-label">实际采样顺序：{[path.source, ...path.processors].map((node) => node.data.name).join(' → ')}{selected?.data.nodeType === 'sink' ? `；用于目标 ${selected.data.name} 的输入检查（不写入）` : ''}</p>}
        <SourcePreviewPanel tenantId={tenantId} pluginId={source.data.pluginId} componentId={source.data.componentId}
          config={source.data.config} operations={sourceComponent?.operations} processors={processors} contextKey={pathKey}
          blockedReason={blockedReason} onResult={reportProcessed} />
      </>}
    </>}
    {selected?.data.nodeType === 'sink' && <section aria-label="Target compatibility" className="mt-4">
      <h4 className="text-xs font-medium">目标兼容性 · {selected.data.name}</h4>
      <PluginOperationsPanel tenantId={tenantId} pluginId={selected.data.pluginId} componentId={selected.data.componentId}
        config={selected.data.config} operations={selectedComponent?.operations} compatibilityOnly
        inputEvidence={{ key: pathKey + sourceKey, schema: inputSchema, scope: direct ? 'source' : 'processed', message: blockedReason }} />
    </section>}
    <p className="workbench-evidence-boundary">来源样本与处理后样本是独立的有界读取，可能来自不同来源时刻；不推断逐行对应关系。连接资源版本以已读取或保存的元数据为准，资源变化后请刷新资源并重新采样。样本与静态兼容性不代表完整流程验证或目标交付。</p>
  </>;
}

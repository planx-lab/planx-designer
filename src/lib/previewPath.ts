import type { PipelineNode } from '@/types/node';
import type { PluginInfo } from '@/types/plugin';
import { MAX_PREVIEW_PROCESSORS } from '@/api/pluginPreview';

/** Resolve evidence provenance from actual edges, never rail or canvas order. */
export function resolvePreviewPath(nodes: PipelineNode[], edges: { source: string; target: string }[], targetId: string | undefined, plugins: PluginInfo[]):
  { error: string } | { source: PipelineNode; processors: PipelineNode[]; target: PipelineNode } {
  const unsupported = (reason: string) => ({ error: `处理后预览不可用：${reason}` });
  const index = new Map(nodes.map((node) => [node.id, node]));
  const target = index.get(targetId ?? '');
  if (!target || target.data.nodeType === 'source') return unsupported('请选择处理或目标节点，预览截至该节点的实际输入链。');
  if (index.size !== nodes.length || nodes.filter((node) => node.data.nodeType === 'source').length !== 1) return unsupported('需要唯一来源与明确的节点标识。');
  if (edges.some((edge) => !index.has(edge.source) || !index.has(edge.target))) return unsupported('存在引用缺失节点的连接。');
  const processors: PipelineNode[] = [];
  const visited = new Set<string>();
  let current = target;
  while (true) {
    if (visited.has(current.id)) return unsupported('上游连接包含环。');
    visited.add(current.id);
    const incoming = edges.filter((edge) => edge.target === current.id);
    const outgoing = edges.filter((edge) => edge.source === current.id);
    if (incoming.length > 1 || outgoing.length > 1) return unsupported('暂不支持分支、合流或多条上游路径。');
    const plugin = plugins.find((item) => item.id === current.data.pluginId);
    const component = plugin?.components.find((item) => item.id === current.data.componentId);
    if (!component || component.kind !== current.data.nodeType) return unsupported('组件身份未在当前目录中确认。');
    if (current.data.nodeType === 'source') {
      if (incoming.length || component.operations?.preview !== true) return unsupported('来源没有可用的显式安全预览钩子，或连接方向错误。');
      return { source: current, processors: processors.reverse(), target };
    }
    if (current.data.nodeType === 'sink') {
      if (current !== target || outgoing.length) return unsupported('目标不能作为处理链的上游。');
    } else {
      if ((component.origin ?? plugin?.origin) !== 'builtin') return unsupported('处理链仅支持已确认的 builtin 组件。');
      processors.push(current);
      if (processors.length > MAX_PREVIEW_PROCESSORS) return unsupported(`最多 ${MAX_PREVIEW_PROCESSORS} 个处理组件。`);
    }
    if (incoming.length !== 1) return unsupported('缺少从来源到当前节点的完整连接。');
    current = index.get(incoming[0].source)!;
  }
}

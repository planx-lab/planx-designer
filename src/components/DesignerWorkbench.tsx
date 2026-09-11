/* WAI-ARIA adjustable separators are intentionally pointer and keyboard interactive. */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
import { memo, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowLeft, GitBranch, Maximize2, Plus, RotateCcw } from 'lucide-react';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { usePaletteStore } from '@/stores/usePaletteStore';
import { useUIStore } from '@/stores/useUIStore';
import { useKeyboardShortcuts } from '@/lib/keyboard';
import { ConfigPanel } from '@/components/editor/ConfigPanel';
import { WorkbenchPreviewPanel } from '@/components/editor/WorkbenchPreviewPanel';
import { PluginPalette } from '@/components/palette/PluginPalette';
import { PipelineCanvas } from '@/components/canvas/PipelineCanvas';
import { SpecPreview } from '@/components/preview/SpecPreview';

const Configuration = memo(ConfigPanel);
const DataEvidence = memo(WorkbenchPreviewPanel);
const kindLabels = { source: '来源', processor: '处理', sink: '目标' };
const DEFAULT_SPLIT = 42;
const clampSplit = (value: number) => Math.max(30, Math.min(65, Math.round(value)));
type ScrollPosition = { top: number; left: number; tableTop: number; tableLeft: number };

function GraphEditor() {
  // Node deletion shortcuts belong to graph editing, not data inspection or forms.
  useKeyboardShortcuts();
  return <PipelineCanvas />;
}

export function DesignerWorkbench() {
  const nodes = usePipelineStore((s) => s.nodes);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectNode = useUIStore((s) => s.selectNode);
  const showPreview = useUIStore((s) => s.showPreview);
  const togglePreview = useUIStore((s) => s.togglePreview);
  const catalogLoading = usePaletteStore((s) => s.loading);
  const catalogError = usePaletteStore((s) => s.error);
  const source = nodes.find((node) => node.data.nodeType === 'source');
  const selected = nodes.find((node) => node.id === selectedNodeId) ?? source ?? nodes[0];

  const [panel, setPanel] = useState<'configure' | 'catalog' | 'graph'>('configure');
  const [split, setSplit] = useState(DEFAULT_SPLIT);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const activePanel = nodes.length === 0 ? 'catalog' : panel;
  const mode = showPreview ? 'spec' : expanded ? 'data' : activePanel === 'graph' ? 'graph' : 'split';
  const configRef = useRef<HTMLElement>(null);
  const evidenceRef = useRef<HTMLElement>(null);
  const evidenceBodyRef = useRef<HTMLDivElement>(null);
  const evidenceTitleRef = useRef<HTMLHeadingElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const configFocus = useRef<HTMLElement | null>(null);
  const positions = useRef<{ split?: ScrollPosition; expanded?: ScrollPosition }>({});
  const restorePending = useRef(false);
  const drag = useRef<{ pointer: number; x: number; split: number; width: number } | null>(null);

  const capturePosition = () => {
    const body = evidenceBodyRef.current;
    const table = body?.querySelector<HTMLElement>('[data-evidence-scroll]');
    positions.current[expanded ? 'expanded' : 'split'] = {
      top: body?.scrollTop ?? 0, left: body?.scrollLeft ?? 0,
      tableTop: table?.scrollTop ?? 0, tableLeft: table?.scrollLeft ?? 0,
    };
  };

  const toggleExpanded = () => {
    capturePosition();
    restorePending.current = true;
    setExpanded((value) => !value);
  };

  useLayoutEffect(() => {
    if (!restorePending.current) return;
    restorePending.current = false;
    const position = positions.current[expanded ? 'expanded' : 'split'] ?? positions.current.split;
    const body = evidenceBodyRef.current;
    const table = body?.querySelector<HTMLElement>('[data-evidence-scroll]');
    if (body && position) {
      body.scrollTop = position.top;
      body.scrollLeft = position.left;
      if (table) { table.scrollTop = position.tableTop; table.scrollLeft = position.tableLeft; }
    }
    if (expanded) evidenceTitleRef.current?.focus({ preventScroll: true });
    else if (configFocus.current?.isConnected) configFocus.current.focus({ preventScroll: true });
    else expandButtonRef.current?.focus({ preventScroll: true });
  }, [expanded]);

  const beginResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const left = configRef.current?.getBoundingClientRect().width ?? 0;
    const right = evidenceRef.current?.getBoundingClientRect().width ?? 0;
    if (!left || !right) return;
    event.preventDefault();
    drag.current = { pointer: event.pointerId, x: event.clientX, split: left / (left + right) * 100, width: left + right };
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    setSplit(clampSplit(start.split + (event.clientX - start.x) / start.width * 100));
  };

  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  const keyboardResize = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const increment = event.shiftKey ? 5 : 2;
    setSplit((current) => clampSplit(event.key === 'Home' ? 30 : event.key === 'End' ? 65 : current + (event.key === 'ArrowLeft' ? -increment : increment)));
  };

  const openNode = (id: string) => { selectNode(id); setPanel('configure'); };
  const layoutStyle = { '--config-share': `${split}fr`, '--evidence-share': `${100 - split}fr` } as CSSProperties;

  return (
    <div className={`designer-workbench${dragging ? ' is-resizing' : ''}`} data-mode={mode} style={layoutStyle}>
      <div className="workbench-tools">
        <div className="workbench-context">
          <strong>{mode === 'data' ? '数据查看' : mode === 'graph' ? '流程与连接' : mode === 'spec' ? '配置文件' : '操作工作台'}</strong>
          <span>{selected ? `${kindLabels[selected.data.nodeType]} · ${selected.data.name || selected.data.pluginLabel}` : '先选择来源组件，再配置数据处理与目标'}</span>
        </div>
        <div className="workbench-actions">
          {mode === 'spec' ? <button type="button" className="workbench-button" onClick={togglePreview}><ArrowLeft size={14} />返回工作台</button> : <>
            {!expanded && <button type="button" className="workbench-button" onClick={() => setPanel(activePanel === 'catalog' ? 'configure' : 'catalog')}>
              {activePanel === 'catalog' && nodes.length > 0 ? <><ArrowLeft size={14} />返回配置</> : <><Plus size={14} />组件目录</>}
            </button>}
            {!expanded && nodes.length > 0 && <button type="button" className="workbench-button" onClick={() => setPanel(activePanel === 'graph' ? 'configure' : 'graph')}>
              <GitBranch size={14} />{activePanel === 'graph' ? '返回配置' : '流程与连接'}
            </button>}
            {mode === 'split' && activePanel === 'configure' && <button type="button" className="workbench-button workbench-reset" onClick={() => setSplit(DEFAULT_SPLIT)} title="只重置面板宽度，不改变配置或样本"><RotateCcw size={13} />重置宽度</button>}
            {(expanded || (mode === 'split' && activePanel === 'configure')) && <button ref={expandButtonRef} type="button" className="workbench-button workbench-emphasis" onClick={toggleExpanded} aria-expanded={expanded} aria-controls="workbench-evidence">
              {expanded ? <ArrowLeft size={14} /> : <Maximize2 size={14} />}{expanded ? '返回配置' : '展开数据'}
            </button>}
          </>}
        </div>
      </div>
      {(catalogLoading || catalogError) && <p className="workbench-catalog-status" role="status">
        {catalogLoading ? '正在获取组件目录，已有配置保持不变。' : '组件目录暂不可用。已有配置未清空，可打开目录查看错误并重试。'}
      </p>}
      <div className="workbench-grid">
        <aside className="workbench-rail" hidden={mode === 'data' || mode === 'spec'} aria-label="节点配置导航">
          <p className="workbench-eyebrow">任务节点</p>
          <nav aria-label="选择要配置的节点">
            {nodes.map((node) => (
              <button type="button" key={node.id} className="workbench-node" aria-pressed={node.id === selected?.id} onClick={() => openNode(node.id)} title={node.data.name || node.data.pluginLabel}>
                <span className={`workbench-node-kind kind-${node.data.nodeType}`}>{kindLabels[node.data.nodeType]}</span>
                <span className="workbench-node-label"><strong>{node.data.name || node.data.pluginLabel}</strong><small>{node.data.pluginLabel || node.data.componentId}</small></span>
              </button>
            ))}
          </nav>
          <p className="workbench-rail-help">{nodes.length ? '这是配置导航，不代表执行顺序。实际连接关系请查看“流程与连接”。' : '从组件目录添加来源、处理和目标，再在“流程与连接”中连接节点。'}</p>
        </aside>

        <section ref={configRef} className="workbench-configuration workbench-panel" hidden={mode !== 'split'} aria-label="当前节点配置" onFocusCapture={(event) => { configFocus.current = event.target; }}>
          <div className="workbench-panel-fill" hidden={activePanel === 'catalog'}><Configuration nodeId={selected?.id} showSourcePreview={false} showCompatibility={false} recordSchemaForms /></div>
          <div className="workbench-panel-fill workbench-catalog" hidden={activePanel !== 'catalog'}>
            <div className="workbench-panel-heading"><p className="workbench-eyebrow">COMPONENT CATALOG</p><h2>选择需要的组件</h2><p>目录来自当前 Engine。点击添加后进入配置；实际连线在流程图中编辑。</p></div>
            <div className="workbench-panel-fill"><PluginPalette onAdded={openNode} /></div>
          </div>
        </section>

        <div className="workbench-resizer" hidden={mode !== 'split'} role="separator" tabIndex={0} aria-label="调整配置与数据宽度" aria-orientation="vertical" aria-controls="workbench-evidence" aria-valuemin={30} aria-valuemax={65} aria-valuenow={split} aria-valuetext={`配置约 ${split}%，数据约 ${100 - split}%`} title="拖动调整宽度，或使用左右方向键；Shift 加快调整" onPointerDown={beginResize} onPointerMove={resize} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => { drag.current = null; setDragging(false); }} onKeyDown={keyboardResize} />

        <aside ref={evidenceRef} id="workbench-evidence" className="workbench-evidence workbench-panel" hidden={mode === 'graph' || mode === 'spec'} aria-label="来源数据证据">
          <div className="workbench-panel-heading"><p className="workbench-eyebrow">DATA EVIDENCE</p><h2 ref={evidenceTitleRef} tabIndex={-1}>先看数据，再配置规则</h2><p>来源样本不随当前编辑节点切换；扩大空间不会重新读取数据。</p></div>
          <div ref={evidenceBodyRef} className="workbench-evidence-body">
            {source ? <DataEvidence selectedNodeId={selected?.id} /> : <div className="workbench-empty"><h3>还没有来源节点</h3><p>从组件目录添加一个来源并填写配置。只有显式读取才会请求真实样本，不会启动任务。</p><button type="button" className="workbench-button workbench-emphasis" onClick={() => setPanel('catalog')}>选择来源组件</button></div>}
          </div>
        </aside>

        {mode === 'graph' && <section className="workbench-graph workbench-panel" aria-label="真实流程图"><GraphEditor /></section>}
        {mode === 'spec' && <section className="workbench-spec workbench-panel" aria-label="PipelineSpec 配置文件"><SpecPreview /></section>}
      </div>
    </div>
  );
}

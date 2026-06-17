import { useState } from 'react';
import {
  Eye,
  EyeOff,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Undo2,
  Redo2,
} from 'lucide-react';

import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { submitPipeline } from '@/api/controlPlane';

export function PipelineToolbar() {
  const name = usePipelineStore((s) => s.name);
  const setName = usePipelineStore((s) => s.setName);
  const tenantId = usePipelineStore((s) => s.tenantId);
  const setTenantId = usePipelineStore((s) => s.setTenantId);
  const buildSpec = usePipelineStore((s) => s.buildSpec);
  const validate = usePipelineStore((s) => s.validate);
  const nodes = usePipelineStore((s) => s.nodes);

  const undo = usePipelineStore((s) => s.undo);
  const redo = usePipelineStore((s) => s.redo);
  const _past = usePipelineStore((s) => s._past);
  const _future = usePipelineStore((s) => s._future);
  const showPreview = useUIStore((s) => s.showPreview);
  const togglePreview = useUIStore((s) => s.togglePreview);
  const submitStatus = useUIStore((s) => s.submitStatus);
  const submitResult = useUIStore((s) => s.submitResult);
  const setSubmitStatus = useUIStore((s) => s.setSubmitStatus);

  const [validating, setValidating] = useState(false);

  const handleValidate = () => {
    setValidating(true);
    const result = validate();
    setTimeout(() => {
      useUIStore.getState().setValidationErrors(result.errors);
      if (!result.valid) {
        useUIStore.getState().selectNode(null); // deselect to show errors
      }
      setValidating(false);
    }, 100);
  };

  const handleSubmit = async () => {
    const result = validate();
    if (!result.valid) {
      useUIStore.getState().setValidationErrors(result.errors);
      return;
    }

    setSubmitStatus('submitting');
    try {
      const spec = buildSpec();
      const response = await submitPipeline(spec, tenantId);
      setSubmitStatus('success', {
        executionId: response.executionId,
        pipelineId: response.pipelineId,
      });
    } catch (err) {
      setSubmitStatus('error', {
        error: err instanceof Error ? err.message : 'Submission failed',
      });
    }
  };

  const canSubmit = nodes.length >= 2; // at least source + sink

  return (
    <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-3">
      {/* Pipeline name */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Pipeline name…"
        className="bg-transparent text-sm font-medium text-foreground placeholder:text-foreground/30 focus:outline-none w-48"
      />

      {/* Tenant ID */}
      <input
        type="text"
        value={tenantId}
        onChange={(e) => setTenantId(e.target.value)}
        placeholder="Tenant ID…"
        className="bg-transparent text-xs text-foreground/40 placeholder:text-foreground/20 focus:outline-none w-32"
      />

      <div className="flex-1" />

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={_past.length === 0}
        title="Undo (Ctrl+Z)"
        className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Undo2 size={16} />
      </button>
      <button
        onClick={redo}
        disabled={_future.length === 0}
        title="Redo (Ctrl+Shift+Z)"
        className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Redo2 size={16} />
      </button>

      {/* Validate */}
      <button
        onClick={handleValidate}
        disabled={validating}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-50"
      >
        {validating ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <AlertCircle size={14} />
        )}
        Validate
      </button>

      {/* Preview toggle */}
      <button
        onClick={togglePreview}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          showPreview
            ? 'bg-accent/20 text-accent'
            : 'text-foreground/60 hover:text-foreground hover:bg-surface-hover'
        }`}
      >
        {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
        Preview
      </button>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitStatus === 'submitting'}
        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          submitStatus === 'success'
            ? 'bg-accent/20 text-accent'
            : submitStatus === 'error'
              ? 'bg-destructive/20 text-destructive'
              : 'bg-accent text-background hover:bg-accent/90'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {submitStatus === 'submitting' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : submitStatus === 'success' ? (
          <CheckCircle2 size={14} />
        ) : submitStatus === 'error' ? (
          <XCircle size={14} />
        ) : (
          <Play size={14} />
        )}
        {submitStatus === 'submitting'
          ? 'Submitting…'
          : submitStatus === 'success'
            ? `Submitted: ${submitResult?.pipelineId?.slice(0, 8) ?? 'ok'}`
            : submitStatus === 'error'
              ? 'Failed — Retry'
              : 'Submit'}
      </button>
    </header>
  );
}

import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';

export function SpecPreview() {
  const [mode, setMode] = useState<'yaml' | 'json'>('yaml');
  const [copied, setCopied] = useState(false);

  const toYaml = usePipelineStore((s) => s.toYaml);
  const buildSpec = usePipelineStore((s) => s.buildSpec);
  const togglePreview = useUIStore((s) => s.togglePreview);

  const yamlStr = toYaml();
  const jsonStr = JSON.stringify(buildSpec(), null, 2);

  const content = mode === 'yaml' ? yamlStr : jsonStr;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">Spec Preview</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setMode('yaml')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                mode === 'yaml'
                  ? 'bg-accent/20 text-accent'
                  : 'text-foreground/40 hover:text-foreground/60'
              }`}
            >
              YAML
            </button>
            <button
              onClick={() => setMode('json')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                mode === 'json'
                  ? 'bg-accent/20 text-accent'
                  : 'text-foreground/40 hover:text-foreground/60'
              }`}
            >
              JSON
            </button>
          </div>
          {/* Copy */}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors text-foreground/40 hover:text-foreground"
          >
            {copied ? <Check size={16} className="text-accent" /> : <Copy size={16} />}
          </button>
          {/* Close */}
          <button
            onClick={togglePreview}
            className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors text-foreground/40 hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <pre className="p-6 text-sm font-mono text-foreground/80 leading-relaxed whitespace-pre">
          {content}
        </pre>
      </div>
    </div>
  );
}

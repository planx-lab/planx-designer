import { useState } from 'react';
import { X, Copy, Check, CheckCircle, AlertCircle } from 'lucide-react';

import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';

export function SpecPreview() {
  const [activeTab, setActiveTab] = useState<'yaml' | 'json' | 'validation'>('yaml');
  const [copied, setCopied] = useState(false);

  const toYaml = usePipelineStore((s) => s.toYaml);
  const buildSpec = usePipelineStore((s) => s.buildSpec);
  const validate = usePipelineStore((s) => s.validate);
  const togglePreview = useUIStore((s) => s.togglePreview);

  const yamlStr = toYaml();
  const jsonStr = JSON.stringify(buildSpec(), null, 2);
  const validationResult = validate();

  const content = activeTab === 'yaml' ? yamlStr : jsonStr;

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
          {/* Tab toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setActiveTab('yaml')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === 'yaml'
                  ? 'bg-accent/20 text-accent'
                  : 'text-foreground/40 hover:text-foreground/60'
              }`}
            >
              YAML
            </button>
            <button
              onClick={() => setActiveTab('json')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === 'json'
                  ? 'bg-accent/20 text-accent'
                  : 'text-foreground/40 hover:text-foreground/60'
              }`}
            >
              JSON
            </button>
            <button
              onClick={() => setActiveTab('validation')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === 'validation'
                  ? 'bg-accent/20 text-accent'
                  : 'text-foreground/40 hover:text-foreground/60'
              }`}
            >
              Validation
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
        {activeTab === 'validation' ? (
          <div className="p-4 space-y-2">
            {validationResult.valid ? (
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="w-4 h-4" />
                <span>Pipeline is valid</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{validationResult.errors.length} issue{validationResult.errors.length > 1 ? 's' : ''} found</span>
                </div>
                <ul className="space-y-1 text-sm text-red-300">
                  {validationResult.errors.map((e, i) => (
                    <li key={i} className="flex gap-1">
                      <span className="text-red-400 shrink-0">✗</span>
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <pre className="p-6 text-sm font-mono text-foreground/80 leading-relaxed whitespace-pre">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

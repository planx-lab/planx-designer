import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

import { usePipelineStore } from './stores/usePipelineStore';
import { useUIStore } from './stores/useUIStore';

// Expose stores for Playwright e2e tests (development only).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pipelineStore = usePipelineStore;
  (window as unknown as Record<string, unknown>).__uiStore = useUIStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

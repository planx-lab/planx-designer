import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles/index.css';

import { usePipelineStore } from './stores/usePipelineStore';
import { useUIStore } from './stores/useUIStore';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000 } },
});

// Expose stores for Playwright e2e tests (development only).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pipelineStore = usePipelineStore;
  (window as unknown as Record<string, unknown>).__uiStore = useUIStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

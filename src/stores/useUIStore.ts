import { create } from 'zustand';

export type ViewId = 'dashboard' | 'designer' | 'executions' | 'pipelines' | 'plugins';

interface UIState {
  selectedNodeId: string | null;
  showPreview: boolean;
  showSubmitModal: boolean;
  validationErrors: string[];
  submitStatus: 'idle' | 'submitting' | 'success' | 'error';
  submitResult: {
    executionId?: string;
    pipelineId?: string;
    error?: string;
  } | null;
  activeView: ViewId;
}

interface UIActions {
  selectNode: (id: string | null) => void;
  togglePreview: () => void;
  openSubmitModal: () => void;
  closeSubmitModal: () => void;
  setValidationErrors: (errors: string[]) => void;
  setSubmitStatus: (
    status: UIState['submitStatus'],
    result?: UIState['submitResult'],
  ) => void;
  setActiveView: (v: ViewId) => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  selectedNodeId: null,
  showPreview: false,
  showSubmitModal: false,
  validationErrors: [],
  submitStatus: 'idle',
  submitResult: null,
  activeView: 'designer',

  selectNode: (id) => set({ selectedNodeId: id }),
  togglePreview: () =>
    set((s) => ({ showPreview: !s.showPreview })),
  openSubmitModal: () => set({ showSubmitModal: true }),
  closeSubmitModal: () => set({ showSubmitModal: false }),
  setValidationErrors: (errors) => set({ validationErrors: errors }),
  setSubmitStatus: (status, result) =>
    set({ submitStatus: status, submitResult: result ?? null }),
  setActiveView: (v) => set({ activeView: v }),
}));

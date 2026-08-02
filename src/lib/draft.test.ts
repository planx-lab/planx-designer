import { describe, it, expect } from 'vitest';
import { shouldSaveDraft } from './draft';

// The autosave subscription must not write a draft for a pipeline that has
// already been persisted. Once submit succeeds the server assigns a pipelineId
// and the pipeline lives in the台账; the localStorage draft is obsolete.
// Writing it back (which is what happened: clearDraft ran, then the autosave
// subscription re-saved on the next store tick) let a stale draft survive a
// page refresh and clobber the just-saved pipeline. (user-scenario-analysis R1)
describe('shouldSaveDraft', () => {
  const base = { name: 'p', tenantId: 't', nodes: [{ id: 'x' }], edges: [] };

  it('saves a draft for a brand-new, unsaved pipeline (no pipelineId)', () => {
    expect(shouldSaveDraft({ ...base, pipelineId: null })).toBe(true);
  });

  it('does NOT save a draft once the pipeline is persisted (pipelineId set)', () => {
    expect(shouldSaveDraft({ ...base, pipelineId: 'server-id' })).toBe(false);
  });

  it('does not save when there are no nodes (empty canvas)', () => {
    expect(shouldSaveDraft({ ...base, nodes: [], pipelineId: null })).toBe(false);
  });
});

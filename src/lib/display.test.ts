import { describe, it, expect } from 'vitest';
import { pipelineDisplayName } from './display';

// pipelineDisplayName resolves the human-readable label for a pipeline row.
// The Pipelines台账 is the user's first navigation surface: it must show the
// name the user typed, never a raw UUID. When the user never named a pipeline
// (empty string), we fall back to a short UUID slice so the row isn't blank —
// but the full UUID never appears as primary text. (user-scenario-analysis.md §3)
describe('pipelineDisplayName', () => {
  it('returns the pipeline name when present', () => {
    expect(pipelineDisplayName('customer-sync', '5f7639fb-10be-4376-ab54-9d2ac0c117f9'))
      .toBe('customer-sync');
  });

  it('falls back to a short UUID slice when name is empty', () => {
    expect(pipelineDisplayName('', '5f7639fb-10be-4376-ab54-9d2ac0c117f9'))
      .toBe('5f7639fb');
  });

  it('falls back to a short UUID slice when name is whitespace-only', () => {
    expect(pipelineDisplayName('   ', '5f7639fb-10be-4376-ab54-9d2ac0c117f9'))
      .toBe('5f7639fb');
  });

  it('returns a placeholder when both name and id are missing', () => {
    expect(pipelineDisplayName('', '')).toBe('Untitled pipeline');
  });
});

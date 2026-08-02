import { describe, it, expect } from 'vitest';
import { pipelineDisplayName, pipelineNameResolver } from './display';
import type { PipelineSummary } from '@/types/admin';

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

// pipelineNameResolver resolves a pipelineId (all the Executions page carries)
// to a human-readable name using a pipelines list. The Executions table's
// PIPELINE column was showing the full pipeline UUID — unreadable. This builds
// an id→name map and falls back to a short id slice, never the full UUID.
describe('pipelineNameResolver', () => {
  const pipelines: PipelineSummary[] = [
    { pipelineId: 'p-1', tenantId: 't', name: 'customer-sync', lastStatus: '', createdAt: '' },
    { pipelineId: 'p-2', tenantId: 't', name: '', lastStatus: '', createdAt: '' }, // unnamed
  ];

  it('resolves a known pipelineId to its name', () => {
    expect(pipelineNameResolver(pipelines)('p-1')).toBe('customer-sync');
  });

  it('falls back to a short id slice for an unnamed-but-known pipeline', () => {
    // 'p-2' is known but unnamed → short slice (UUID_FALLBACK_LEN=8, but id < 8 → full short id)
    expect(pipelineNameResolver(pipelines)('p-2')).toBe('p-2');
  });

  it('falls back to a short UUID slice for an unknown pipelineId (no full UUID)', () => {
    const long = '9bbabe4b-b087-468a-8997-6999931c4697';
    expect(pipelineNameResolver(pipelines)(long)).toBe('9bbabe4b');
  });

  it('never returns the full UUID as primary text', () => {
    const long = '9bbabe4b-b087-468a-8997-6999931c4697';
    const result = pipelineNameResolver(pipelines)(long);
    expect(result.length).toBeLessThan(long.length);
  });
});

import { describe, it, expect } from 'vitest';
import { normalizeStatus } from './controlPlane';

// The engine returns UPPERCASE pipeline-level status (model.ExecutionStatus:
// PENDING/RUNNING/SUCCEEDED/FAILED), but the Designer contract is lowercase
// (matches node-level NodeStatus in dag_run.go + alpha spec success criteria #4).
// normalizeStatus bridges that at the API boundary.

describe('normalizeStatus', () => {
  it('lowercases engine UPPERCASE pipeline status', () => {
    expect(normalizeStatus({ status: 'PENDING' }).status).toBe('pending');
    expect(normalizeStatus({ status: 'RUNNING' }).status).toBe('running');
    expect(normalizeStatus({ status: 'SUCCEEDED' }).status).toBe('succeeded');
    expect(normalizeStatus({ status: 'FAILED' }).status).toBe('failed');
  });

  it('is idempotent on already-lowercase status', () => {
    expect(normalizeStatus({ status: 'running' }).status).toBe('running');
  });

  it('preserves sibling fields', () => {
    const r = normalizeStatus({ executionId: 'e1', pipelineId: 'p1', status: 'RUNNING' });
    expect(r).toMatchObject({ executionId: 'e1', pipelineId: 'p1', status: 'running' });
  });

  it('does not touch nested nodeStatuses (already lowercase)', () => {
    const r = normalizeStatus({
      status: 'RUNNING',
      nodeStatuses: { 'src-1': { nodeId: 'src-1', status: 'running' } },
    });
    expect(r.nodeStatuses['src-1'].status).toBe('running');
  });
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { HealthResponse } from '@/types/admin';
import { StatusIndicator } from './StatusIndicator';

const health = vi.hoisted(() => ({
  data: undefined as HealthResponse | undefined,
  isLoading: false,
  isError: false,
}));
vi.mock('@/hooks/queries', () => ({ useHealth: () => health }));

beforeEach(() => {
  health.data = { status: 'ok', pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v1' };
  health.isLoading = false;
  health.isError = false;
});
afterEach(cleanup);

it('shows Ready only when both managed workflow contracts are present', () => {
  render(<StatusIndicator />);
  expect(screen.getByRole('status', { name: 'Engine status: Ready' })).toHaveAttribute('title', 'Engine is ready');
});

it.each([
  { name: 'missing workflows', features: {} },
  { name: 'draft only', features: { pipelineWorkflow: 'draft-v1' } },
  { name: 'managed only', features: { connectionWorkflow: 'managed-v1' } },
  { name: 'old managed version', features: { pipelineWorkflow: 'draft-v1', connectionWorkflow: 'managed-v0' } },
  { name: 'old draft version', features: { pipelineWorkflow: 'draft-v0', connectionWorkflow: 'managed-v1' } },
])('does not label $name health as Ready', ({ features }) => {
  health.data = { status: 'ok', ...features };
  render(<StatusIndicator />);
  const status = screen.getByRole('status', { name: 'Engine status: Upgrade required' });
  expect(status).toHaveClass('text-warning');
  expect(status).toHaveAttribute('title', 'Engine requires draft-v1 and managed-v1 workflows. Update and restart the Engine.');
  expect(screen.queryByRole('status', { name: 'Engine status: Ready' })).not.toBeInTheDocument();
});

it('preserves the actual degraded health state', () => {
  health.data = { status: 'degraded', error: 'Synthetic health degradation' };
  render(<StatusIndicator />);
  expect(screen.getByRole('status', { name: 'Engine status: Degraded' })).toHaveAttribute('title', 'Synthetic health degradation');
});

it('keeps transport failure distinct from protocol incompatibility', () => {
  health.isError = true;
  render(<StatusIndicator />);
  expect(screen.getByRole('status', { name: 'Engine status: Offline' })).toHaveAttribute('title', 'Engine unreachable');
});

it('does not claim readiness while health is loading', () => {
  health.data = undefined;
  health.isLoading = true;
  render(<StatusIndicator />);
  expect(screen.getByRole('status').getAttribute('title')).toMatch(/^Checking engine/);
  expect(screen.queryByRole('status', { name: 'Engine status: Ready' })).not.toBeInTheDocument();
});

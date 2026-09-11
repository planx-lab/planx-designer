import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExecutionProgressPanel } from './ExecutionProgressPanel';
import { useUIStore } from '@/stores/useUIStore';

let client: QueryClient;
beforeEach(() => {
  localStorage.setItem('planx-admin:tenant', 'reference');
  useUIStore.setState({ tenantId: 'stale-designer-tenant' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

function openProgress(progress: string) {
  const fetch = vi.fn().mockResolvedValue(new Response(
    `{"executionId":"exec-stats","status":"SUCCEEDED","progress":${progress}}`,
  ));
  vi.stubGlobal('fetch', fetch);
  render(<QueryClientProvider client={client}><ExecutionProgressPanel executionId="exec-stats" /></QueryClientProvider>);
  return fetch;
}

it('identifies successful source ACKs as nil returns, not broker durable confirmation', async () => {
  openProgress('{"nodes":{},"sourceDeliveries":3,"acknowledgedDeliveries":3,"ackErrors":0,"inFlightBatches":0,"inFlightBytes":0}');
  expect(await screen.findByText(/Source.Ack returned nil/)).toBeInTheDocument();
  expect(screen.getByText(/does not prove broker-side durable confirmation or exactly-once delivery/)).toBeInTheDocument();
  expect(screen.getByText('Source acknowledged deliveries').parentElement).toHaveTextContent('3');
  expect(screen.queryByText('Broker confirmed')).not.toBeInTheDocument();
});

it('keeps unknown ACK outcomes distinct after pending and in-flight gauges are released', async () => {
  openProgress('{"nodes":{},"sourceDeliveries":1,"acknowledgedDeliveries":0,"unknownAcknowledgements":1,"ackErrors":1,"inFlightBatches":0,"inFlightBytes":0,"pendingAcknowledgements":0,"oldestPendingAcknowledgementNanos":0}');
  await screen.findByText('Pending source acknowledgements');
  expect(screen.getByText('Unknown source acknowledgements').parentElement).toHaveTextContent('1');
  expect(screen.getByText('Source acknowledged deliveries').parentElement).toHaveTextContent('0');
  expect(screen.getByText(/Terminal cleanup can release pending ACK gauges without successful source confirmation/)).toBeInTheDocument();
  expect(screen.getByText(/Other ACK errors do not prove remote non-confirmation/)).toBeInTheDocument();
});

it('fetches tenant-scoped wall-time and cleanup observations without rounding int64 values', async () => {
  const fetch = openProgress('{"nodes":{},"ackDurationNanos":9007199254740993,"cleanupErrors":2,"cleanupNanos":9007199254740995,"pendingAcknowledgements":3,"oldestPendingAcknowledgementNanos":9007199254740997}');
  await screen.findByText('9007199254740993');
  expect(screen.getByText('9007199254740995')).toBeInTheDocument();
  expect(screen.getByText('9007199254740997')).toBeInTheDocument();
  expect(screen.getByText('ACK duration (ns)').parentElement).toHaveTextContent('9007199254740993');
  expect(screen.getByText(/Durations are wall time in nanoseconds, not CEL evaluator cost/)).toBeInTheDocument();
  expect(fetch.mock.calls[0][0]).toContain('/executions/exec-stats?tenantId=reference');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('shows opaque transport measurements without claiming typed business row counts', async () => {
  openProgress('{"nodes":{"external":{"typed":false,"inputRows":999,"outputRows":999,"attemptedRows":999,"committedRows":999,"unknownCommits":999,"inputBytes":9007199254740993,"outputBytes":40,"queueWaitNanos":12,"backpressureNanos":13,"cleanupErrors":1,"cleanupNanos":15}}}');
  const table = await screen.findByRole('table', { name: 'Node transport and cleanup' });
  const row = within(table).getByRole('row', { name: /external/ });
  expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['external', '9007199254740993', '40', '12', '13', '1', '15']);
  expect(screen.getByText('Row counts unavailable (untyped).')).toBeInTheDocument();
  expect(screen.queryByText('999')).not.toBeInTheDocument();
  expect(screen.getByText(/Byte measurements are payload estimates, not process RSS/)).toBeInTheDocument();
});

it('does not fabricate new gauges or domain statistics for an older response', async () => {
  openProgress('{"nodes":{},"sourceDeliveries":3,"acknowledgedDeliveries":3,"ackErrors":0,"inFlightBatches":0,"inFlightBytes":0}');
  expect(await screen.findByText('Runtime timing and pending ACK gauges not reported.')).toBeInTheDocument();
  expect(screen.getByText('No node transport or cleanup measurements reported.')).toBeInTheDocument();
  expect(screen.getByText('No component domain statistics reported.')).toBeInTheDocument();
  expect(screen.queryByRole('table', { name: 'Component domain statistics' })).not.toBeInTheDocument();
  expect(screen.queryByText('ACK duration (ns)')).not.toBeInTheDocument();
});

it('retains explicit zero but does not invent absent observations in a partial snapshot', async () => {
  openProgress('{"nodes":{"read":{"typed":true,"inputBytes":0}},"pendingAcknowledgements":0}');
  await screen.findByText('Pending source acknowledgements');
  expect(screen.getByText('Pending source acknowledgements').parentElement).toHaveTextContent('0');
  expect(screen.getByText('ACK duration (ns)').parentElement).toHaveTextContent('Not reported');
  const row = within(screen.getByRole('table', { name: 'Node transport and cleanup' })).getByRole('row', { name: /^read/ });
  expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['read', '0', 'Not reported', 'Not reported', 'Not reported', 'Not reported', 'Not reported']);
});

it('renders only server-reported domain snapshots, preserving exact values and raw keys', async () => {
  openProgress('{"nodes":{"enrich":{"typed":true,"domainStats":{"cache_hits":9007199254740993,"cache_entries":0,"new_server_counter":7}}}}');
  const table = await screen.findByRole('table', { name: 'Component domain statistics' });
  expect(within(table).getByRole('row', { name: 'enrich cache_hits 9007199254740993' })).toBeInTheDocument();
  expect(within(table).getByRole('row', { name: 'enrich cache_entries 0' })).toBeInTheDocument();
  expect(within(table).getByRole('row', { name: 'enrich new_server_counter 7' })).toBeInTheDocument();
  expect(within(table).queryByText('cel_cost_units')).not.toBeInTheDocument();
  expect(screen.getByText(/Snapshots may contain cumulative counters or live gauges; absent statistics are not zero/)).toBeInTheDocument();
});

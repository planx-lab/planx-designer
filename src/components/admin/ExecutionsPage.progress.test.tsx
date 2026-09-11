import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ExecutionsPage } from './ExecutionsPage';
import { useUIStore } from '@/stores/useUIStore';

let client: QueryClient;
beforeEach(() => {
  localStorage.setItem('planx-admin:tenant', 'tenant-a');
  useUIStore.setState({ tenantId: 'tenant-a' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } });
  client.setQueryData(['executions', 'tenant-a', 1, ''], { total: 1, executions: [{
    id: 'exec-1', pipelineId: 'pipeline-1', tenantId: 'tenant-a', status: 'RUNNING', createdAt: '2026-09-08T00:00:00Z',
  }] });
  client.setQueryData(['pipelines', 'tenant-a', 'index'], { pipelines: [{ pipelineId: 'pipeline-1', name: 'Demo' }] });
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

function expand() {
  render(<QueryClientProvider client={client}><MemoryRouter><ExecutionsPage /></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: /Execution of Demo, RUNNING/ }));
}

it('fetches actual detail progress and keeps exact counters and commit/ACK meanings separate', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"executionId":"exec-1","pipelineId":"pipeline-1","status":"RUNNING","progress":{"nodes":{"sink":{"typed":true,"inputRows":9007199254740993,"outputRows":0,"attemptedRows":10,"committedRows":7,"unknownCommits":3}},"sourceDeliveries":4,"acknowledgedDeliveries":2,"ackErrors":1,"inFlightBatches":2,"inFlightBytes":128}}'));
  vi.stubGlobal('fetch', fetch);
  expand();
  await screen.findByText('9007199254740993');
  const row = screen.getByRole('row', { name: /sink.*9007199254740993/ });
  expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['sink', '9007199254740993', '0', '10', '7', '3']);
  for (const label of ['Attempted rows', 'Committed rows', 'Unknown commits', 'Source deliveries', 'Source acknowledged deliveries', 'ACK errors', 'In-flight batches', 'In-flight bytes']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(fetch.mock.calls[0][0]).toContain('/executions/exec-1?tenantId=tenant-a');
});

it('shows absent progress as unavailable, not zero', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"executionId":"exec-1","pipelineId":"pipeline-1","status":"RUNNING"}')));
  expand();
  expect(await screen.findByText('No execution progress reported.')).toBeInTheDocument();
  expect(screen.queryByText('Committed rows')).not.toBeInTheDocument();
});

it('does not display business row counts for typed=false nodes', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"executionId":"exec-1","pipelineId":"pipeline-1","status":"RUNNING","progress":{"nodes":{"opaque":{"typed":false,"inputRows":999,"outputRows":999,"attemptedRows":999,"committedRows":999,"unknownCommits":999}}}}')));
  expand();
  expect(await screen.findByText('Row counts unavailable (untyped).')).toBeInTheDocument();
  expect(screen.queryByText('999')).not.toBeInTheDocument();
  expect(screen.getAllByText('Not reported')).toHaveLength(6);
});

it('reports detail read failure without changing the listed execution outcome', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expand();
  expect(await screen.findByRole('alert')).toHaveTextContent('Execution progress unavailable');
  expect(screen.getByRole('button', { name: /Execution of Demo, RUNNING/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Execution of Demo, FAILED/ })).not.toBeInTheDocument();
});

it.each([
  { unknownAcknowledgements: 1, expected: '1' },
  { unknownAcknowledgements: undefined, expected: 'Not reported' },
])('keeps source confirmation uncertainty separate when reported as $expected', async ({ unknownAcknowledgements, expected }) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    executionId: 'exec-1', pipelineId: 'pipeline-1', status: 'RUNNING',
    progress: {
      nodes: { sink: { typed: true, inputRows: 7, outputRows: 0, attemptedRows: 7, committedRows: 7, unknownCommits: 0 } },
      sourceDeliveries: 1, acknowledgedDeliveries: 0, unknownAcknowledgements,
      ackErrors: 1, inFlightBatches: 0, inFlightBytes: 0,
    },
  }))));
  expand();
  await screen.findByText('Unknown source acknowledgements');
  const count = (label: string) => screen.getByText(label).parentElement!.querySelector('dd')!.textContent;
  expect(count('Unknown source acknowledgements')).toBe(expected);
  expect(count('Source acknowledged deliveries')).toBe('0');
  expect(count('ACK errors')).toBe('1');
  expect(count('In-flight batches')).toBe('0');
  const row = screen.getByRole('row', { name: /^sink / });
  expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['sink', '7', '0', '7', '7', '0']);
  expect(screen.getByText(/ACK errors may include unknown outcomes/)).toBeInTheDocument();
});


it('uses the listed tenant for progress even when the designer store is stale', async () => {
  useUIStore.setState({ tenantId: 'stale-designer-tenant' });
  const fetch = vi.fn().mockImplementation(async (url: string) => {
    if (!url.endsWith('/executions/exec-1?tenantId=tenant-a')) {
      return new Response('{"error":"Execution not found"}', { status: 404 });
    }
    return new Response('{"id":"exec-1","tenantId":"tenant-a","pipelineId":"pipeline-1","status":"SUCCEEDED","progress":{"nodes":{},"sourceDeliveries":3,"acknowledgedDeliveries":3,"ackErrors":0,"inFlightBatches":0,"inFlightBytes":0}}');
  });
  vi.stubGlobal('fetch', fetch);
  expand();
  expect(await screen.findByText('Source acknowledged deliveries')).toBeInTheDocument();
  expect(screen.queryByText(/Execution progress unavailable/)).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain('tenantId=tenant-a');
});

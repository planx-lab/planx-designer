import { useQuery } from '@tanstack/react-query';
import { getExecution } from '@/api/controlPlane';
import { getTenant } from '@/hooks/queries';
import type { ProgressCount } from '@/types/progress';

const MOVEMENT = [
  ['sourceDeliveries', 'Source deliveries'],
  ['acknowledgedDeliveries', 'Source acknowledged deliveries'],
  ['unknownAcknowledgements', 'Unknown source acknowledgements'],
  ['ackErrors', 'ACK errors'],
  ['inFlightBatches', 'In-flight batches'],
  ['inFlightBytes', 'In-flight bytes'],
] as const;

const ROWS = [
  ['inputRows', 'Input rows'], ['outputRows', 'Output rows'],
  ['attemptedRows', 'Attempted rows'], ['committedRows', 'Committed rows'],
  ['unknownCommits', 'Unknown commits'],
] as const;

const RUNTIME = [
  ['ackDurationNanos', 'ACK duration (ns)'],
  ['cleanupErrors', 'Cleanup errors'],
  ['cleanupNanos', 'Cleanup duration (ns)'],
  ['pendingAcknowledgements', 'Pending source acknowledgements'],
  ['oldestPendingAcknowledgementNanos', 'Oldest pending acknowledgement (ns)'],
] as const;

const TRANSPORT = [
  ['inputBytes', 'Input bytes'], ['outputBytes', 'Output bytes'],
  ['queueWaitNanos', 'Queue wait (ns)'], ['backpressureNanos', 'Backpressure (ns)'],
  ['cleanupErrors', 'Cleanup errors'], ['cleanupNanos', 'Cleanup duration (ns)'],
] as const;

function count(value: ProgressCount | undefined): string {
  return value == null ? 'Not reported' : String(value);
}

/** Read-only detail polling. Transport uncertainty never changes run status. */
export function ExecutionProgressPanel({ executionId }: { executionId: string }) {
  const tenantId = getTenant();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['execution-progress', tenantId, executionId],
    queryFn: () => getExecution(executionId, tenantId),
    enabled: !!tenantId.trim(),
    retry: false,
    refetchInterval: 10_000,
  });

  if (!tenantId.trim()) return <p className="text-xs text-warning">Tenant context is required for progress.</p>;
  if (error) return (
    <div role="alert" className="text-xs text-warning">
      Execution progress unavailable. Last listed execution status is unchanged.
      <button type="button" onClick={() => void refetch()} className="ml-2 text-accent hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded">Retry progress</button>
    </div>
  );
  if (isPending) return <p role="status" className="text-xs text-foreground/40">Loading execution progress...</p>;
  const progress = data?.progress;
  if (!progress) return <p className="text-xs text-foreground/40">No execution progress reported.</p>;
  const nodes = Object.entries(progress.nodes ?? {});
  const measuredNodes = nodes.filter(([, node]) => TRANSPORT.some(([key]) => node[key] != null));
  const domainStats = nodes.flatMap(([nodeId, node]) =>
    Object.entries(node.domainStats ?? {}).map(([key, value]) => ({ nodeId, key, value })),
  );

  return (
    <section aria-label="Execution progress" className="space-y-2 border-t border-border pt-2">
      <p className="text-xs text-foreground/40 font-medium">Execution progress</p>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-[11px]">
        {MOVEMENT.map(([key, label]) => (
          <div key={key}>
            <dt className="text-foreground/40">{label}</dt>
            <dd className="text-foreground/80 font-mono tabular-nums">{count(progress[key])}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-foreground/40">Source.Ack returned nil is the meaning of a successful source acknowledgement. It does not prove broker-side durable confirmation or exactly-once delivery.</p>
      {RUNTIME.some(([key]) => progress[key] != null) ? (
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-[11px]">
          {RUNTIME.map(([key, label]) => (
            <div key={key}>
              <dt className="text-foreground/40">{label}</dt>
              <dd className="text-foreground/80 font-mono tabular-nums">{count(progress[key])}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="text-[11px] text-foreground/40">Runtime timing and pending ACK gauges not reported.</p>}
      {nodes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] text-left">
            <thead><tr className="border-b border-border text-foreground/40">
              <th scope="col" className="px-2 py-1 font-medium">Node</th>
              {ROWS.map(([key, label]) => <th key={key} scope="col" className="px-2 py-1 font-medium whitespace-nowrap">{label}</th>)}
            </tr></thead>
            <tbody>{nodes.map(([nodeId, node]) => (
              <tr key={nodeId} className="border-b border-border/50 text-foreground/70 font-mono tabular-nums">
                <td className="px-2 py-1">{nodeId}</td>
                {node.typed === true ? ROWS.map(([key]) => (
                  <td key={key} className="px-2 py-1">{count(node[key])}</td>
                )) : <td colSpan={5} className="px-2 py-1 text-foreground/40 font-sans">Row counts unavailable (untyped).</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="text-[11px] text-foreground/40">No node row counts reported.</p>}
      {measuredNodes.length > 0 ? (
        <div className="overflow-x-auto">
          <table aria-label="Node transport and cleanup" className="w-full text-[11px] text-left">
            <thead><tr className="border-b border-border text-foreground/40">
              <th scope="col" className="px-2 py-1 font-medium">Node</th>
              {TRANSPORT.map(([key, label]) => <th key={key} scope="col" className="px-2 py-1 font-medium whitespace-nowrap">{label}</th>)}
            </tr></thead>
            <tbody>{measuredNodes.map(([nodeId, node]) => (
              <tr key={nodeId} className="border-b border-border/50 text-foreground/70 font-mono tabular-nums">
                <td className="px-2 py-1">{nodeId}</td>
                {TRANSPORT.map(([key]) => <td key={key} className="px-2 py-1">{count(node[key])}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="text-[11px] text-foreground/40">No node transport or cleanup measurements reported.</p>}
      {domainStats.length > 0 ? (
        <div className="overflow-x-auto">
          <table aria-label="Component domain statistics" className="w-full text-[11px] text-left">
            <thead><tr className="border-b border-border text-foreground/40">
              <th scope="col" className="px-2 py-1 font-medium">Node</th>
              <th scope="col" className="px-2 py-1 font-medium">Statistic (raw key)</th>
              <th scope="col" className="px-2 py-1 font-medium">Value</th>
            </tr></thead>
            <tbody>{domainStats.map(({ nodeId, key, value }) => (
              <tr key={`${nodeId}:${key}`} className="border-b border-border/50 text-foreground/70 font-mono tabular-nums">
                <td className="px-2 py-1">{nodeId}</td><td className="px-2 py-1">{key}</td><td className="px-2 py-1">{count(value)}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="text-[11px] text-foreground/40">Snapshots may contain cumulative counters or live gauges; absent statistics are not zero. Raw keys and units are supplied by each component.</p>
        </div>
      ) : <p className="text-[11px] text-foreground/40">No component domain statistics reported.</p>}
      <p className="text-[11px] text-foreground/40">Source acknowledgements, target commits and local in-flight ownership are independent. ACK errors may include unknown outcomes; zero in-flight does not prove source acknowledgement or target commit.</p>
      <p className="text-[11px] text-foreground/40">Unknown source acknowledgements are a subset of ACK errors, not successful ACKs. Other ACK errors do not prove remote non-confirmation. Terminal cleanup can release pending ACK gauges without successful source confirmation.</p>
      <p className="text-[11px] text-foreground/40">Byte measurements are payload estimates, not process RSS: node bytes are cumulative transfers; in-flight bytes estimate currently retained payload and schema. Durations are wall time in nanoseconds, not CEL evaluator cost or critical-path latency. Unknown commits count Sink.Write unknown-result events, not rows.</p>
    </section>
  );
}

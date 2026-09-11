import type { LosslessNumber } from 'lossless-json';

/** Go int64 counters remain exact even beyond Number.MAX_SAFE_INTEGER. */
export type ProgressCount = number | LosslessNumber;

export interface NodeProgress {
  /** Cumulative logical payload bytes, not retained memory or RSS. */
  inputBytes?: ProgressCount;
  outputBytes?: ProgressCount;
  queueWaitNanos?: ProgressCount;
  backpressureNanos?: ProgressCount;
  cleanupErrors?: ProgressCount;
  cleanupNanos?: ProgressCount;
  /** Raw instance snapshots: keys may be cumulative counters or live gauges. */
  domainStats?: Record<string, ProgressCount>;
  typed: boolean;
  inputRows: ProgressCount;
  outputRows: ProgressCount;
  attemptedRows: ProgressCount;
  committedRows: ProgressCount;
  /** Sink.Write unknown-result events, not a count of unknown rows. */
  unknownCommits: ProgressCount;
}

export interface ExecutionProgress {
  /** Optional for older responses; absent does not mean a measured zero. */
  ackDurationNanos?: ProgressCount;
  cleanupErrors?: ProgressCount;
  cleanupNanos?: ProgressCount;
  pendingAcknowledgements?: ProgressCount;
  oldestPendingAcknowledgementNanos?: ProgressCount;
  nodes: Record<string, NodeProgress> | null;
  sourceDeliveries: ProgressCount;
  /** Source.Ack returned nil; not independent proof of broker durability. */
  acknowledgedDeliveries: ProgressCount;
  unknownAcknowledgements?: ProgressCount;
  ackErrors: ProgressCount;
  inFlightBatches: ProgressCount;
  inFlightBytes: ProgressCount;
}

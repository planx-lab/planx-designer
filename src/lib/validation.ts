import type { PipelineSpec, NodeKind } from '@/types/pipeline';
import type { ValidationResult } from '@/types/pipeline';

const NODE_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const KINDS: NodeKind[] = ['source', 'processor', 'sink'];

/** Validate a DAG PipelineSpec. Mirrors engine ValidateDAG V-001..V-020.
 * Collects ALL errors (no short-circuit) so the user sees everything. */
export function validateSpec(spec: PipelineSpec): ValidationResult {
  const errors: string[] = [];
  if (!spec.metadata.name?.trim()) errors.push('Pipeline name is required.');
  if (!spec.metadata.tenantId?.trim()) errors.push('Tenant ID is required.');
  if (spec.apiVersion !== 'planx.io/v4') errors.push('apiVersion must be planx.io/v4.');
  if (spec.kind !== 'Pipeline') errors.push('kind must be Pipeline.');
  if (spec.spec.nodes.length < 2) errors.push('Pipeline needs at least 2 nodes (1 source + 1 sink).');

  const seen = new Set<string>();
  let sources = 0, sinks = 0;
  const idSet = new Set(spec.spec.nodes.map((n) => n.id));
  for (const n of spec.spec.nodes) {
    if (seen.has(n.id)) errors.push(`Duplicate node id "${n.id}".`);
    seen.add(n.id);
    if (!NODE_ID_RE.test(n.id)) errors.push(`Invalid node id "${n.id}".`);
    if (!n.plugin_id?.trim()) errors.push(`Node "${n.id}": plugin_id is required.`);
    if (!KINDS.includes(n.kind)) errors.push(`Node "${n.id}": unknown kind "${n.kind}".`);
    if (n.kind === 'source') sources++;
    if (n.kind === 'sink') sinks++;
  }
  if (sources !== 1) errors.push(`Exactly 1 source required (got ${sources}).`);
  if (sinks !== 1) errors.push(`Exactly 1 sink required (got ${sinks}).`);

  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const n of spec.spec.nodes) { inDeg.set(n.id, 0); outDeg.set(n.id, 0); }
  const seenEdge = new Set<string>();
  for (const e of spec.spec.edges) {
    if (!idSet.has(e.from)) errors.push(`Edge ${e.from} -> ${e.to}: node "${e.from}" not found.`);
    if (!idSet.has(e.to)) errors.push(`Edge ${e.from} -> ${e.to}: node "${e.to}" not found.`);
    if (e.from === e.to) errors.push(`Self-loop on node "${e.from}".`);
    const k = `${e.from}->${e.to}`;
    if (seenEdge.has(k)) errors.push(`Duplicate edge ${k}.`);
    seenEdge.add(k);
    if (idSet.has(e.to)) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    if (idSet.has(e.from)) outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
  }
  for (const n of spec.spec.nodes) {
    if (n.kind === 'source' && (inDeg.get(n.id) ?? 0) !== 0)
      errors.push(`Source "${n.id}" must have in-degree 0.`);
    if (n.kind === 'sink' && (outDeg.get(n.id) ?? 0) !== 0)
      errors.push(`Sink "${n.id}" must have out-degree 0.`);
    if (n.kind === 'processor' && ((inDeg.get(n.id) ?? 0) === 0 || (outDeg.get(n.id) ?? 0) === 0))
      errors.push(`Processor "${n.id}" must have in- and out-degree >= 1.`);
  }

  if (hasCycle(spec)) errors.push('Graph contains a cycle.');
  const reachErr = reachabilityErr(spec);
  if (reachErr) errors.push(reachErr);

  return { valid: errors.length === 0, errors };
}

/** Kahn's algorithm — true if a cycle exists. */
function hasCycle(spec: PipelineSpec): boolean {
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of spec.spec.nodes) inDeg.set(n.id, 0);
  for (const e of spec.spec.edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, d] of inDeg) if (d === 0) queue.push(id);
  let processed = 0;
  while (queue.length) {
    const n = queue.shift()!;
    processed++;
    for (const to of adj.get(n) ?? []) {
      inDeg.set(to, (inDeg.get(to) ?? 0) - 1);
      if (inDeg.get(to) === 0) queue.push(to);
    }
  }
  return processed !== spec.spec.nodes.length;
}

/** Forward BFS from source + reverse BFS from sink. Returns an error string if unreachable, else null. */
function reachabilityErr(spec: PipelineSpec): string | null {
  const source = spec.spec.nodes.find((n) => n.kind === 'source')?.id;
  const sink = spec.spec.nodes.find((n) => n.kind === 'sink')?.id;
  if (!source || !sink) return null; // cardinality already flagged
  const fwd = bfs(source, spec.spec.edges);
  for (const n of spec.spec.nodes) {
    if (n.id !== source && !fwd.has(n.id)) return `Node "${n.id}" is not reachable from source.`;
  }
  const rev = bfs(sink, spec.spec.edges.map((e) => ({ from: e.to, to: e.from })));
  for (const n of spec.spec.nodes) {
    if (n.id !== sink && !rev.has(n.id)) return `Node "${n.id}" cannot reach sink.`;
  }
  return null;
}

function bfs(start: string, edges: { from: string; to: string }[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const n = stack.pop()!;
    for (const to of adj.get(n) ?? []) {
      if (!seen.has(to)) { seen.add(to); stack.push(to); }
    }
  }
  return seen;
}

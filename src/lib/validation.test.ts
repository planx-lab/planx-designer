import { describe, it, expect } from 'vitest';
import { validateSpec } from './validation';
import { API_VERSION } from '@/types/pipeline';
import type { PipelineSpec } from '@/types/pipeline';

function twoSinks(): PipelineSpec {
  return {
    apiVersion: API_VERSION,
    kind: 'Pipeline',
    metadata: { name: 'p', tenantId: 't' },
    spec: {
      nodes: [
        { id: 'src', kind: 'source', plugin_id: 's', component_id: 'c' },
        { id: 'snk-a', kind: 'sink', plugin_id: 'k', component_id: 'c' },
        { id: 'snk-b', kind: 'sink', plugin_id: 'k', component_id: 'c' },
      ],
      edges: [
        { from: 'src', to: 'snk-a' },
        { from: 'src', to: 'snk-b' },
      ],
    },
  };
}

function threeSinksViaProcessor(): PipelineSpec {
  return {
    apiVersion: API_VERSION,
    kind: 'Pipeline',
    metadata: { name: 'p', tenantId: 't' },
    spec: {
      nodes: [
        { id: 'src', kind: 'source', plugin_id: 's', component_id: 'c' },
        { id: 'p1', kind: 'processor', plugin_id: 'p', component_id: 'c' },
        { id: 'snk-a', kind: 'sink', plugin_id: 'k', component_id: 'c' },
        { id: 'snk-b', kind: 'sink', plugin_id: 'k', component_id: 'c' },
        { id: 'snk-c', kind: 'sink', plugin_id: 'k', component_id: 'c' },
      ],
      edges: [
        { from: 'src', to: 'p1' },
        { from: 'p1', to: 'snk-a' },
        { from: 'p1', to: 'snk-b' },
        { from: 'p1', to: 'snk-c' },
      ],
    },
  };
}

// ADR-016: multi-Sink fan-out is valid (≥1 sink). The Designer validation
// must mirror the engine's relaxed V-006, and reachability reverse-BFS must
// seed from the sink SET (a node is valid if it reaches any sink).
describe('validateSpec — multi-sink (ADR-016)', () => {
  it('accepts two sinks (fan-out from source)', () => {
    const r = validateSpec(twoSinks());
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('accepts three sinks via a shared processor', () => {
    const r = validateSpec(threeSinksViaProcessor());
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('still rejects zero sinks', () => {
    const s = twoSinks();
    s.spec.nodes = s.spec.nodes.filter((n) => n.kind !== 'sink');
    s.spec.edges = [];
    const r = validateSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /sink/i.test(e))).toBe(true);
  });

  it('flags a processor that cannot reach any sink (dangling branch)', () => {
    // src branches to snk-a and to a dangling proc that goes nowhere.
    const s: PipelineSpec = {
      apiVersion: API_VERSION, kind: 'Pipeline',
      metadata: { name: 'p', tenantId: 't' },
      spec: {
        nodes: [
          { id: 'src', kind: 'source', plugin_id: 's', component_id: 'c' },
          { id: 'snk-a', kind: 'sink', plugin_id: 'k', component_id: 'c' },
          { id: 'dangle', kind: 'processor', plugin_id: 'p', component_id: 'c' },
        ],
        edges: [
          { from: 'src', to: 'snk-a' },
          { from: 'src', to: 'dangle' },
        ],
      },
    };
    const r = validateSpec(s);
    expect(r.valid).toBe(false);
    // dangle has out-degree 0 (V-020) and cannot reach a sink (V-019).
    expect(r.errors.some((e) => /dangle/i.test(e))).toBe(true);
  });
});

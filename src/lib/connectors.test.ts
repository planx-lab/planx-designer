import { describe, it, expect } from 'vitest';
import {
  groupPluginsByConnector,
  connectorCapabilityList,
} from './connectors';
import type { PluginDescriptor } from '@/types/plugin';

function makePlugin(
  overrides: Partial<PluginDescriptor> & {
    name: string;
    type: PluginDescriptor['type'];
    connector: string;
  },
): PluginDescriptor {
  return {
    version: '1.0.0',
    protocol: 'v4',
    ...overrides,
  } as PluginDescriptor;
}

describe('groupPluginsByConnector', () => {
  it('groups plugins sharing a connector into one Connector', () => {
    const plugins = [
      makePlugin({ name: 'mysql-source', type: 'source', connector: 'mysql' }),
      makePlugin({ name: 'mysql-sink', type: 'sink', connector: 'mysql' }),
    ];
    const connectors = groupPluginsByConnector(plugins);
    expect(connectors).toHaveLength(1);
    expect(connectors[0].id).toBe('mysql');
    expect(connectors[0].capabilities.source?.name).toBe('mysql-source');
    expect(connectors[0].capabilities.sink?.name).toBe('mysql-sink');
    expect(connectors[0].capabilities.processor).toBeUndefined();
  });

  it('keeps separate connectors distinct', () => {
    const plugins = [
      makePlugin({ name: 'source-hello', type: 'source', connector: 'source-hello' }),
      makePlugin({ name: 'sink-stdout', type: 'sink', connector: 'sink-stdout' }),
    ];
    const connectors = groupPluginsByConnector(plugins);
    expect(connectors).toHaveLength(2);
  });

  it('falls back to plugin name when connector is empty', () => {
    const plugins = [
      makePlugin({ name: 'http-sink', type: 'sink', connector: '' }),
    ];
    const connectors = groupPluginsByConnector(plugins);
    expect(connectors).toHaveLength(1);
    expect(connectors[0].id).toBe('http-sink');
  });

  it('uses displayName when present', () => {
    const plugins = [
      makePlugin({
        name: 'mysql-source',
        type: 'source',
        connector: 'mysql',
        displayName: 'MySQL',
      }),
    ];
    const connectors = groupPluginsByConnector(plugins);
    expect(connectors[0].displayName).toBe('MySQL');
  });

  it('sorts connectors by displayName for stable order', () => {
    const plugins = [
      makePlugin({ name: 'z-sink', type: 'sink', connector: 'zeta' }),
      makePlugin({ name: 'a-source', type: 'source', connector: 'alpha' }),
    ];
    const connectors = groupPluginsByConnector(plugins);
    expect(connectors.map((c) => c.id)).toEqual(['alpha', 'zeta']);
  });

  it('handles empty input', () => {
    expect(groupPluginsByConnector([])).toEqual([]);
  });
});

describe('connectorCapabilityList', () => {
  it('returns the kinds a connector implements', () => {
    const connectors = groupPluginsByConnector([
      makePlugin({ name: 'mysql-source', type: 'source', connector: 'mysql' }),
      makePlugin({ name: 'mysql-sink', type: 'sink', connector: 'mysql' }),
    ]);
    expect(connectorCapabilityList(connectors[0])).toEqual([
      'source',
      'sink',
    ]);
  });

  it('returns single kind for single-capability connectors', () => {
    const connectors = groupPluginsByConnector([
      makePlugin({ name: 'transform', type: 'processor', connector: 'transform' }),
    ]);
    expect(connectorCapabilityList(connectors[0])).toEqual(['processor']);
  });
});

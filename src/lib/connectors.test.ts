import { describe, it, expect } from 'vitest';
import {
  groupPluginsByConnector,
  connectorCapabilityList,
} from './connectors';
import type { PluginInfo, ComponentKind } from '@/types/plugin';

function makePlugin(
  overrides: Partial<PluginInfo> & { id: string },
  kind: ComponentKind,
  _connector: string,
): PluginInfo {
  return {
    version: '1.0.0',
    displayName: overrides.id,
    components: [{ id: kind, kind, displayName: kind }],
    ...overrides,
  } as PluginInfo;
}

describe('groupPluginsByConnector', () => {
  it('groups plugins sharing a connector into one Connector', () => {
    const plugins = [
      makePlugin({ id: 'mysql-source' }, 'source', 'mysql'),
      makePlugin({ id: 'mysql-sink' }, 'sink', 'mysql'),
    ];
    const connectors = groupPluginsByConnector(plugins);
    expect(connectors).toHaveLength(1);
    expect(connectors[0].id).toBe('mysql');
    expect(connectors[0].capabilities.source?.id).toBe('mysql-source');
    expect(connectors[0].capabilities.sink?.id).toBe('mysql-sink');
    expect(connectors[0].capabilities.processor).toBeUndefined();
  });

  it('keeps separate connectors distinct', () => {
    const plugins = [
      makePlugin({ id: 'source-hello' }, 'source', 'source-hello'),
      makePlugin({ id: 'sink-stdout' }, 'sink', 'sink-stdout'),
    ];
    const connectors = groupPluginsByConnector(plugins);
    expect(connectors).toHaveLength(2);
  });

  it('falls back to plugin name when connector is empty', () => {
    const plugins = [
      makePlugin({ id: 'http-sink' }, 'sink', ''),
    ];
    const connectors = groupPluginsByConnector(plugins);
    expect(connectors).toHaveLength(1);
    expect(connectors[0].id).toBe('http-sink');
  });

  it('uses displayName when present', () => {
    const plugins = [
      makePlugin({
        id: 'mysql-source',
        displayName: 'MySQL',
      }, 'source', 'mysql'),
    ];
    const connectors = groupPluginsByConnector(plugins);
    expect(connectors[0].displayName).toBe('MySQL');
  });

  it('sorts connectors by displayName for stable order', () => {
    const plugins = [
      makePlugin({ id: 'z-sink' }, 'sink', 'zeta'),
      makePlugin({ id: 'a-source' }, 'source', 'alpha'),
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
      makePlugin({ id: 'mysql-source' }, 'source', 'mysql'),
      makePlugin({ id: 'mysql-sink' }, 'sink', 'mysql'),
    ]);
    expect(connectorCapabilityList(connectors[0])).toEqual([
      'source',
      'sink',
    ]);
  });

  it('returns single kind for single-capability connectors', () => {
    const connectors = groupPluginsByConnector([
      makePlugin({ id: 'transform' }, 'processor', 'transform'),
    ]);
    expect(connectorCapabilityList(connectors[0])).toEqual(['processor']);
  });
});

import { describe, it, expect } from 'vitest';
import { groupComponentsByKind } from './connectors';
import type { PluginInfo } from '@/types/plugin';

function makePlugin(
  overrides: Partial<PluginInfo> & { id: string },
  ...kinds: ('source' | 'processor' | 'sink')[]
): PluginInfo {
  return {
    version: '1.0.0',
    displayName: overrides.id,
    components: kinds.map((k) => ({
      id: k,
      kind: k,
      displayName: k,
    })),
    ...overrides,
  } as PluginInfo;
}

describe('groupComponentsByKind', () => {
  it('groups components by kind when a plugin has multiple capabilities', () => {
    const items = groupComponentsByKind([
      makePlugin({ id: 'mysql' }, 'source', 'sink'),
    ]);
    expect(items.source).toHaveLength(1);
    expect(items.sink).toHaveLength(1);
    expect(items.processor).toHaveLength(0);
    expect(items.source[0].componentId).toBe('source');
    expect(items.sink[0].componentId).toBe('sink');
  });

  it('places components from different plugins into the correct groups', () => {
    const items = groupComponentsByKind([
      makePlugin({ id: 'source-hello' }, 'source'),
      makePlugin({ id: 'processor-transform' }, 'processor'),
      makePlugin({ id: 'sink-stdout' }, 'sink'),
    ]);
    expect(items.source).toHaveLength(1);
    expect(items.processor).toHaveLength(1);
    expect(items.sink).toHaveLength(1);
    expect(items.source[0].pluginId).toBe('source-hello');
    expect(items.processor[0].pluginId).toBe('processor-transform');
    expect(items.sink[0].pluginId).toBe('sink-stdout');
  });

  it('annotates each palette item with its owning plugin metadata', () => {
    const items = groupComponentsByKind([
      makePlugin(
        {
          id: 'mysql',
          displayName: 'MySQL Connector',
          description: 'MySQL database',
        },
        'source',
      ),
    ]);
    expect(items.source[0]).toMatchObject({
      pluginId: 'mysql',
      pluginDisplayName: 'MySQL Connector',
      componentId: 'source',
      kind: 'source',
      description: 'MySQL database',
    });
  });

  it('sorts palette items by component display name', () => {
    const items = groupComponentsByKind([
      {
        id: 'b',
        version: '1.0.0',
        displayName: 'B Plugin',
        components: [{ id: 'src', kind: 'source', displayName: 'B Source' }],
      },
      {
        id: 'a',
        version: '1.0.0',
        displayName: 'A Plugin',
        components: [{ id: 'src', kind: 'source', displayName: 'A Source' }],
      },
      {
        id: 'c',
        version: '1.0.0',
        displayName: 'C Plugin',
        components: [{ id: 'src', kind: 'source', displayName: 'C Source' }],
      },
    ]);
    expect(items.source.map((i) => i.componentDisplayName)).toEqual([
      'A Source',
      'B Source',
      'C Source',
    ]);
  });

  it('handles empty plugin list', () => {
    const items = groupComponentsByKind([]);
    expect(items.source).toEqual([]);
    expect(items.processor).toEqual([]);
    expect(items.sink).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../../config/schema.ts';
import {
  configuredMonitorIds,
  configuredMonitorRefs,
  findServerGroup,
  requireSecret,
  type ServerConfig,
} from '../../../src/server/config.ts';

const config = (): ServerConfig => ({
  configVersion: 'version-a',
  cache: {},
  groups: parseConfig({
    site: { name: 'Test' },
    groups: [
      {
        id: 'external',
        name: 'External',
        source: { type: 'uptimerobot', apiKeyEnv: 'ROBOT_KEY' },
        subgroups: [
          { id: 'tools', name: 'Tools', monitorIds: ['same', 'one'] },
          { id: 'cloud', name: 'Cloud', monitorIds: ['same'] },
        ],
      },
      {
        id: 'core',
        name: 'Core',
        source: {
          type: 'peekaping',
          baseUrl: 'https://peekaping.example.test',
          apiKeyEnv: 'PEEK_KEY',
        },
        subgroups: [{ id: 'web', name: 'Web', slug: 'web' }],
      },
    ],
  }).groups,
});

describe('server configuration boundary', () => {
  it('finds only the requested group and keeps the config version', () => {
    const value = config();
    expect(findServerGroup(value, 'external')?.id).toBe('external');
    expect(findServerGroup(value, 'missing')).toBeNull();
    expect(value.configVersion).toBe('version-a');
  });

  it('deduplicates UptimeRobot IDs while retaining subgroup membership', () => {
    const group = config().groups[0];
    expect([...configuredMonitorIds(group)!]).toEqual(['same', 'one']);
    expect(configuredMonitorRefs(group)).toEqual([
      { id: 'same', subgroupIds: ['tools', 'cloud'] },
      { id: 'one', subgroupIds: ['tools'] },
    ]);
  });

  it('leaves Peekaping selection to its live status page allowlist', () => {
    expect(configuredMonitorIds(config().groups[1])).toBeNull();
    expect(configuredMonitorRefs(config().groups[1])).toEqual([]);
  });

  it('rejects absent or blank server secrets', () => {
    expect(requireSecret({ ROBOT_KEY: ' secret ' }, 'ROBOT_KEY')).toBe('secret');
    expect(() => requireSecret({}, 'ROBOT_KEY')).toThrow('ROBOT_KEY');
    expect(() => requireSecret({ ROBOT_KEY: '  ' }, 'ROBOT_KEY')).toThrow('ROBOT_KEY');
  });
});

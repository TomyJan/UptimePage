import { parseConfig } from '../../config/schema.ts';
import type { ServerConfig } from '../../src/server/config.ts';
import type { ResponseCache } from '../../src/server/cache.ts';
export const now = new Date('2026-10-21T12:00:00Z');
export const epoch = now.getTime() / 1000;
export const config = (peekaping = false): ServerConfig => ({
  configVersion: 'a'.repeat(64),
  cache: {},
  groups: parseConfig({
    site: { name: 'Test' },
    groups: [
      {
        id: 'core',
        name: 'Core',
        source: peekaping
          ? { type: 'peekaping', baseUrl: 'https://source.test', apiKeyEnv: 'KEY' }
          : { type: 'uptimerobot', apiKeyEnv: 'KEY' },
        subgroups: peekaping
          ? [
              { id: 'one', name: 'One', slug: 'one' },
              { id: 'two', name: 'Two', slug: 'two' },
            ]
          : [{ id: 'one', name: 'One', monitorIds: ['1'] }],
      },
    ],
  }).groups,
});
export const raw = {
  id: 1,
  friendly_name: 'API',
  status: 9,
  interval: 300,
  monitor_interval: 30,
  create_datetime: epoch - 86400 * 100,
  custom_uptime_ratios: '98.25',
  response_times: [
    { datetime: epoch - 600, value: 120 },
    { datetime: epoch - 60, value: 0 },
  ],
  logs: [{ type: 1, datetime: epoch - 300, duration: 0 }],
};
export const fetcher: typeof fetch = async () =>
  Response.json({ stat: 'ok', monitors: [raw], pagination: { total: 1 } });
export function memoryCache(): ResponseCache {
  const values = new Map<string, Response>();
  return {
    async match(req) {
      return values.get(new Request(req).url)?.clone();
    },
    async put(req, res) {
      values.set(new Request(req).url, res.clone());
    },
  };
}

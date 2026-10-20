import { expect, it } from 'vitest';
import { parseConfig } from '../../../config/schema.ts';
import { handleApi } from '../../../src/server/api.ts';
import type { ServerConfig } from '../../../src/server/config.ts';

const config: ServerConfig = {
  configVersion: 'version-a',
  groups: parseConfig({
    site: { name: 'Test' },
    groups: [
      {
        id: 'group',
        name: 'Group',
        source: { type: 'uptimerobot', apiKeyEnv: 'KEY' },
        subgroups: [{ id: 'web', name: 'Web', monitorIds: ['1'] }],
      },
    ],
  }).groups,
};

const fetcher = async () =>
  new Response(
    JSON.stringify({
      monitors: [
        {
          id: 1,
          friendly_name: 'Website',
          status: 2,
          custom_uptime_ratio: '100.00',
          average_response_time: 42,
        },
      ],
      pagination: { total: 1 },
    }),
  );

it('serves only the configured group and monitor routes', async () => {
  const runtime = { config, environment: { KEY: 'secret' }, fetcher };
  const group = await handleApi(new Request('https://site.test/api/v1/groups/group'), runtime);
  expect(group.status).toBe(200);
  expect((await group.json()).monitors[0]).toMatchObject({ id: '1', state: 'operational' });
  const detail = await handleApi(
    new Request('https://site.test/api/v1/groups/group/monitors/1?range=24h'),
    runtime,
  );
  expect(detail.status).toBe(200);
  expect((await detail.json()).monitor.id).toBe('1');
});

it('rejects unknown groups, monitors and unsupported methods without touching upstream', async () => {
  const runtime = {
    config,
    environment: { KEY: 'secret' },
    fetcher: async () => {
      throw new Error('called');
    },
  };
  expect(
    (await handleApi(new Request('https://site.test/api/v1/groups/missing'), runtime)).status,
  ).toBe(404);
  expect(
    (
      await handleApi(
        new Request('https://site.test/api/v1/groups/group/monitors/missing'),
        runtime,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await handleApi(
        new Request('https://site.test/api/v1/groups/group', { method: 'POST' }),
        runtime,
      )
    ).status,
  ).toBe(404);
});

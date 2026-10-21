import { expect, it } from 'vitest';
import { createHttpClient } from '../../src/data/client.ts';
it('preserves safe diagnostics from JSON errors and identifies non-JSON edge failures', async () => {
  const signal = new AbortController().signal;
  const upstream = createHttpClient('', async () =>
    Response.json(
      {
        error: {
          code: 'unavailable',
          retryAt: null,
          diagnostic: { reason: 'upstream-http', status: 401, stage: 'source', message: 'secret' },
        },
      },
      { status: 502 },
    ),
  );
  await expect(upstream.getGroup('core', signal)).rejects.toMatchObject({
    diagnostic: { reason: 'upstream-http', status: 401 },
  });
  const edge = createHttpClient(
    '',
    async () => new Response('secret runtime error', { status: 545 }),
  );
  await expect(edge.getGroup('core', signal)).rejects.toMatchObject({
    diagnostic: { reason: 'edge-runtime', status: 545 },
  });
});

it('keeps auth failures distinct from public removal even with a misleading error body', async () => {
  for (const status of [401, 403]) {
    const client = createHttpClient('', async () =>
      Response.json({ error: { code: 'not-found', retryAt: null } }, { status }),
    );
    await expect(client.getGroup('core', new AbortController().signal)).rejects.toMatchObject({
      code: 'unavailable',
      diagnostic: { status },
    });
  }
});

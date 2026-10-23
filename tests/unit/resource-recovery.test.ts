import { expect, it } from 'vitest';
import { createResourceRecovery } from '../../src/app/resource-recovery.ts';

function fixture(saved = new Map<string, string>()) {
  const events: string[] = [];
  const flags = { editing: false, online: true, latest: 'new-build', blocked: false };
  const recovery = createResourceRecovery({
    currentBuild: () => 'old-build',
    latestBuild: async () => {
      events.push('probe');
      return flags.latest;
    },
    isEditing: () => flags.editing,
    isOnline: () => flags.online,
    storage: () => {
      if (flags.blocked) throw new Error('Storage blocked');
      return {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => {
          saved.set(key, value);
        },
      };
    },
    reload: () => {
      events.push('reload');
    },
  });
  return { recovery, flags, events, saved };
}

it('reloads only after confirming a different build and records the attempt across page loads', async () => {
  const first = fixture();
  await Promise.all([first.recovery.failed(), first.recovery.failed()]);
  expect(first.events).toEqual(['probe', 'reload']);
  expect(first.recovery.getSnapshot()).toBe('reloading');
  const second = fixture(first.saved);
  await second.recovery.failed();
  expect(second.events).toEqual(['probe']);
  expect(second.recovery.getSnapshot()).toBe('failed');
});

it('keeps the page when a failed import is not caused by a confirmed version change', async () => {
  const { recovery, flags, events } = fixture();
  flags.latest = 'old-build';
  await recovery.failed();
  expect(events).toEqual(['probe']);
  expect(recovery.getSnapshot()).toBe('failed');
});

it('does not forget a recovery attempt when deployments roll forward and back', async () => {
  const saved = new Map<string, string>();
  for (const [latest, expectedReloads] of [
    ['build-b', 1],
    ['build-c', 1],
    ['build-b', 0],
  ] as const) {
    const { recovery, flags, events } = fixture(saved);
    flags.latest = latest;
    await recovery.failed();
    expect(events.filter((event) => event === 'reload')).toHaveLength(expectedReloads);
  }
});

it('does not probe or reload while offline, but permits an explicit reload after reconnection', async () => {
  const { recovery, flags, events } = fixture();
  flags.online = false;
  await recovery.failed();
  recovery.reload();
  expect(events).toEqual([]);
  expect(recovery.getSnapshot()).toBe('offline');
  flags.online = true;
  recovery.reload();
  expect(events).toEqual(['reload']);
});

it('preserves active editor drafts without probing, including explicit reload attempts', async () => {
  const { recovery, flags, events } = fixture();
  flags.editing = true;
  await recovery.failed();
  recovery.reload();
  expect(events).toEqual([]);
  expect(recovery.getSnapshot()).toBe('editor');
});

it('rechecks editor protection after an asynchronous deployment probe', async () => {
  const { recovery, flags, events } = fixture();
  const pending = recovery.failed();
  flags.editing = true;
  await pending;
  expect(events).toEqual(['probe']);
  expect(recovery.getSnapshot()).toBe('editor');
});

it('requires a working reload guard before any automatic reload', async () => {
  const { recovery, flags, events } = fixture();
  flags.blocked = true;
  await recovery.failed();
  expect(events).toEqual(['probe']);
  expect(recovery.getSnapshot()).toBe('failed');
});

it('keeps draft protection until the editor is explicitly exited', async () => {
  const { recovery, flags, events } = fixture();
  flags.editing = true;
  await recovery.failed();
  flags.editing = false;
  recovery.refreshProtection();
  expect(recovery.getSnapshot()).toBe('failed');
  expect(events).toEqual([]);
});

it('does not automatically reload when storage silently drops the loop guard', async () => {
  let reloads = 0;
  const recovery = createResourceRecovery({
    currentBuild: () => 'old',
    latestBuild: async () => 'new',
    isEditing: () => false,
    isOnline: () => true,
    storage: () => ({ getItem: () => null, setItem: () => {} }),
    reload: () => {
      reloads++;
    },
  });
  await recovery.failed();
  expect(recovery.getSnapshot()).toBe('failed');
  expect(reloads).toBe(0);
});

it('falls back safely when deployment confirmation fails or produces no build identity', async () => {
  for (const latestBuild of [
    async () => null,
    async () => {
      throw new Error('network');
    },
  ]) {
    let reloads = 0;
    const recovery = createResourceRecovery({
      currentBuild: () => 'old',
      latestBuild,
      isEditing: () => false,
      isOnline: () => true,
      storage: () => {
        throw new Error('unused');
      },
      reload: () => {
        reloads++;
      },
    });
    await recovery.failed();
    expect(recovery.getSnapshot()).toBe('failed');
    expect(reloads).toBe(0);
  }
});

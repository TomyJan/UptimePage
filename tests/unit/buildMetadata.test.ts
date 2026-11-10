import { expect, it } from 'vitest';
import { buildMetadata } from '../../scripts/build-metadata.ts';

it('displays a short hash while linking to the full build revision', () => {
  const revision = 'aabbccd' + '1'.repeat(33);
  expect(buildMetadata(revision)).toEqual({
    commit: 'aabbccd',
    commitUrl: `https://github.com/TomyJan/UptimePage/commit/${revision}`,
  });
});
it.each([7, 8, 39, 41, 63, 65])(
  'rejects an incomplete or invalid-length revision of %i digits',
  (length) => {
    expect(() => buildMetadata('a'.repeat(length))).toThrow('full Git commit hash');
  },
);
it('supports full SHA-256 Git revisions without shortening the link', () => {
  const revision = 'a'.repeat(64);
  expect(buildMetadata(revision)).toEqual({
    commit: 'aaaaaaa',
    commitUrl: `https://github.com/TomyJan/UptimePage/commit/${revision}`,
  });
});
it('links source archives without Git metadata to project history and rejects invalid overrides', () => {
  expect(buildMetadata()).toEqual({
    commit: 'dev',
    commitUrl: 'https://github.com/TomyJan/UptimePage/commits/master',
  });
  expect(() => buildMetadata('aabbccd')).toThrow('full Git commit hash');
  expect(() => buildMetadata('not/a/revision')).toThrow('full Git commit hash');
});

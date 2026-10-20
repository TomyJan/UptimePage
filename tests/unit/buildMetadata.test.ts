import { expect, it } from 'vitest';
import { buildMetadata } from '../../scripts/build-metadata.ts';

it('displays a short hash while linking to the full build revision', () => {
  const revision = 'aabbccd' + '1'.repeat(33);
  expect(buildMetadata(revision)).toEqual({
    commit: 'aabbccd',
    commitUrl: `https://github.com/TomyJan/UptimePage/commit/${revision}`,
  });
});
it('links source archives without Git metadata to project history and rejects invalid overrides', () => {
  expect(buildMetadata()).toEqual({
    commit: 'dev',
    commitUrl: 'https://github.com/TomyJan/UptimePage/commits/master',
  });
  expect(() => buildMetadata('not/a/revision')).toThrow('Git commit hash');
});

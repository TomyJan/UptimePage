const repository = 'https://github.com/TomyJan/UptimePage';

export function buildMetadata(revision?: string) {
  const hash = revision?.trim();
  if (!hash) return { commit: 'dev', commitUrl: `${repository}/commits/master` };
  if (!/^[a-f0-9]{7,64}$/i.test(hash))
    throw new Error('UPTIMEPAGE_COMMIT must be a Git commit hash');
  return { commit: hash.slice(0, 7), commitUrl: `${repository}/commit/${hash}` };
}

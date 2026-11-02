import { snapshotError, type Snapshot } from '../../data/snapshot.ts';
import { ApiClientError } from '../../data/client.ts';
import { useRefresh } from './useRefresh.ts';
import { useRefreshFeedback } from './useRefreshFeedback.ts';

type SnapshotQuery<T extends Snapshot> = {
  data: T | undefined;
  error: unknown;
  isFetching: boolean;
  refetch: (options: { cancelRefetch: boolean }) => Promise<{ data?: T; error: unknown }>;
};

/** Initial loads, range changes, retry buttons and polling expose one view state. */
export function useSnapshotRefresh<T extends Snapshot>(
  query: SnapshotQuery<T>,
  identity: string,
  displayed = query.data,
) {
  const issue = snapshotError(query.data);
  const error = query.error ?? issue;
  const request = useRefreshFeedback(async () => {
    const result = await query.refetch({ cancelRefetch: false });
    const error = result.error ?? snapshotError(result.data);
    if (error) throw error;
  }, identity);
  const retryAt =
    [issue?.retryAt, error instanceof ApiClientError ? error.retryAt : null]
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .at(-1) ?? null;
  const state = useRefresh(request, identity, retryAt);
  return {
    ...state,
    busy: query.isFetching || state.busy,
    // A retained snapshot owns its timestamp, including a cached partial response.
    fetchedAt: displayed?.fetchedAt ?? null,
    error,
  };
}

export type SnapshotRefresh = ReturnType<typeof useSnapshotRefresh>;

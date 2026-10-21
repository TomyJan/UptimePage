import { useRef } from 'react';
import { useCopy } from '../preferences/copy.ts';
import { toastStore } from '../toasts/store.ts';
import { errorMessage } from './feedback.ts';
/** Manual, scheduled and retry requests share one result notification. */
export function useRefreshFeedback(request: () => Promise<unknown>, identity: string) {
  const t = useCopy();
  const pending = useRef(new Map<string, Promise<unknown>>());
  return () => {
    const existing = pending.current.get(identity);
    if (existing) return existing;
    const flight = Promise.resolve()
      .then(request)
      .then(
        (value) => {
          toastStore.push(t('refreshDone'), 5000, 'success');
          return value;
        },
        (error) => {
          toastStore.push(`${t('refreshFailed')}: ${errorMessage(error, t)}`, 8000, 'warning');
          throw error;
        },
      )
      .finally(() => {
        pending.current.delete(identity);
      });
    pending.current.set(identity, flight);
    return flight;
  };
}

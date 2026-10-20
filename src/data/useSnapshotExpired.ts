import { useEffect, useState } from 'react';

/** Polling is optional; an old snapshot must still stop claiming current health. */
export function useSnapshotExpired(fetchedAt: string | null): boolean {
  const [, update] = useState(0);
  const deadline = fetchedAt ? Date.parse(fetchedAt) + 300_000 : NaN;
  useEffect(() => {
    if (!Number.isFinite(deadline)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      update((revision) => revision + 1);
      const remaining = deadline - Date.now();
      if (remaining > 0) timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
    };
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pageshow', check);
    };
  }, [deadline]);
  return Number.isFinite(deadline) && Date.now() >= deadline;
}

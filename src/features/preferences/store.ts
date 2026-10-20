import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { resolveLocale, resolveTimeZone } from './locale.ts';
const schema = z.object({
  language: z.enum(['auto', 'en', 'zh-CN']).catch('auto'),
  timeZone: z.string().catch('auto'),
  theme: z.enum(['auto', 'light', 'dark']).catch('auto'),
  refresh: z
    .union([z.literal('auto'), z.literal(0), z.literal(30), z.literal(60), z.literal(300)])
    .catch('auto'),
});
export type Preferences = z.infer<typeof schema>;
export function readPreferences(storage: Pick<Storage, 'getItem'>): Preferences {
  try {
    return schema.parse(JSON.parse(storage.getItem('uptimepage.preferences') ?? '{}'));
  } catch {
    return schema.parse({});
  }
}
let current: Preferences =
  typeof window === 'undefined'
    ? schema.parse({})
    : (() => {
        try {
          return readPreferences(window.localStorage);
        } catch {
          return schema.parse({});
        }
      })();
const listeners = new Set<() => void>();
export function setPreferences(patch: Partial<Preferences>) {
  current = schema.parse({ ...current, ...patch });
  try {
    localStorage.setItem('uptimepage.preferences', JSON.stringify(current));
  } catch {
    /* Storage is optional. */
  }
  listeners.forEach((fn) => fn());
}
export function usePreferences() {
  const preferences = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
  return {
    preferences,
    locale:
      preferences.language === 'auto' ? resolveLocale(navigator.languages) : preferences.language,
    timeZone: resolveTimeZone(preferences.timeZone),
  };
}

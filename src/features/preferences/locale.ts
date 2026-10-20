import type { Locale, LocalizedText } from '../../shared/contracts.ts';
export function resolveLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const tag = language.toLowerCase();
    if (/^en(?:-|$)/.test(tag)) return 'en';
    if (tag === 'zh' || /^zh-(?:cn|sg|hans)(?:-|$)/.test(tag)) return 'zh-CN';
  }
  return 'en';
}
export function resolveTimeZone(preference: string | null): string {
  try {
    const zone =
      preference === null || preference === 'auto'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : preference;
    if (!zone) return 'UTC';
    new Intl.DateTimeFormat('en', { timeZone: zone }).format();
    return zone;
  } catch {
    return 'UTC';
  }
}
export function localize(text: LocalizedText, locale: Locale): string {
  return typeof text === 'string' ? text : (text[locale] ?? text.en);
}

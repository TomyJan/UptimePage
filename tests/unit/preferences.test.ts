import { describe, expect, it } from 'vitest';
import { resolveLocale, resolveTimeZone } from '../../src/features/preferences/locale.ts';
import { readPreferences } from '../../src/features/preferences/store.ts';

describe('browser preferences', () => {
  it.each([
    [['fr-FR', 'zh-Hant', 'en-US'], 'en'],
    [['zh-CN', 'en'], 'zh-CN'],
    [['zh-SG'], 'zh-CN'],
    [['zh-Hans-SG'], 'zh-CN'],
    [['zh-TW'], 'en'],
    [['en-GB', 'zh-CN'], 'en'],
    [[], 'en'],
  ])('resolves %j without treating traditional Chinese as simplified', (languages, want) =>
    expect(resolveLocale(languages as string[])).toBe(want),
  );
  it('rejects a corrupt saved timezone', () => expect(resolveTimeZone('Mars/Olympus')).toBe('UTC'));
  it('survives inaccessible and corrupt storage', () => {
    expect(
      readPreferences({
        getItem() {
          throw Error('blocked');
        },
      }),
    ).toEqual({ language: 'auto', timeZone: 'auto', theme: 'auto', refresh: 'auto' });
    expect(readPreferences({ getItem: () => '{broken' }).theme).toBe('auto');
    expect(readPreferences({ getItem: () => '{"theme":"evil","refresh":-3}' }).refresh).toBe(
      'auto',
    );
  });
});

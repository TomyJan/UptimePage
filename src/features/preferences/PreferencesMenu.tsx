import { Clock3, Globe2, Moon, Sun } from 'lucide-react';
import { Dropdown } from '../../components/Dropdown.tsx';
import { useCopy } from './copy.ts';
import { usePreferences, setPreferences, type Preferences } from './store.ts';
export function PreferencesMenu() {
  const { preferences: p, locale, timeZone } = usePreferences(),
    t = useCopy();
  const zones = [
    ...new Set([
      'UTC',
      'Asia/Shanghai',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Europe/London',
      'Europe/Berlin',
      'America/New_York',
      'America/Los_Angeles',
      timeZone,
    ]),
  ];
  return (
    <nav
      className="nav-tools"
      aria-label={`${t('language')} / ${t('timezone')} / ${t('appearance')}`}
    >
      <Dropdown
        label={t('language')}
        value={p.language}
        options={[
          { value: 'auto', label: t('auto') },
          { value: 'zh-CN', label: '简体中文' },
          { value: 'en', label: 'English' },
        ]}
        onChange={(v) => setPreferences({ language: v as Preferences['language'] })}
      >
        <Globe2 size={16} />
        <span>{locale === 'zh-CN' ? '简中' : 'EN'}</span>
      </Dropdown>
      <Dropdown
        label={t('timezone')}
        value={p.timeZone}
        options={[
          { value: 'auto', label: t('auto') },
          ...zones.map((v) => ({ value: v, label: v.replaceAll('_', ' ') })),
        ]}
        onChange={(v) => setPreferences({ timeZone: v })}
      >
        <Clock3 size={16} />
        <span>{timeZone.split('/').at(-1)?.replaceAll('_', ' ')}</span>
      </Dropdown>
      <span className="nav-divider" aria-hidden="true" />
      <Dropdown
        label={t('appearance')}
        value={p.theme}
        options={(['auto', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(v) }))}
        onChange={(v) => setPreferences({ theme: v as Preferences['theme'] })}
      >
        {p.theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
      </Dropdown>
    </nav>
  );
}

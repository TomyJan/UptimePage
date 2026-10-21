import { useState } from 'react';
import type { Locale } from '../../shared/contracts.ts';
import { localize } from '../preferences/locale.ts';
import { Field, Toggle, type FormProps } from './fields.tsx';
import { SiteFields } from './SiteFields.tsx';
import { GroupFields, newGroup } from './GroupFields.tsx';
import { MonitorFields } from './MonitorFields.tsx';
import { usePreferences } from '../preferences/store.ts';
export type EditorCategory = 'site' | 'groups' | 'monitors' | 'cache';
export function EditorForm({
  category,
  config,
  change,
  t,
}: Omit<FormProps, 'language'> & { category: EditorCategory }) {
  const { locale } = usePreferences();
  const [language, setLanguage] = useState<Locale>(locale);
  const [selected, setSelected] = useState(0),
    index = Math.min(selected, config.groups.length - 1);
  const props = { config, change, t, language };
  return (
    <div className="ce-form-swap" key={category}>
      {category !== 'cache' && (
        <div className="ce-form-meta">
          <span>{t('textLanguage')}</span>
          <div className="window-tabs">
            {(['zh-CN', 'en'] as const).map((locale) => (
              <button
                key={locale}
                className={language === locale ? 'active' : ''}
                onClick={() => setLanguage(locale)}
                aria-pressed={language === locale}
              >
                {locale === 'zh-CN' ? '简中' : 'English'}
              </button>
            ))}
          </div>
        </div>
      )}
      {(category === 'groups' || category === 'monitors') && (
        <div className="ce-group-selector">
          {config.groups.map((g, i) => (
            <button
              className={i === index ? 'active' : ''}
              key={i}
              aria-pressed={i === index}
              onClick={() => setSelected(i)}
            >
              {localize(g.name, language)}
            </button>
          ))}
          {category === 'groups' && (
            <button
              onClick={() => {
                change((c) => {
                  c.groups.push(newGroup(c));
                });
                setSelected(config.groups.length);
              }}
            >
              ＋ {t('add')}
            </button>
          )}
        </div>
      )}
      {category === 'site' && <SiteFields {...props} />}
      {category === 'groups' && <GroupFields {...props} index={index} onSelect={setSelected} />}
      {category === 'monitors' && <MonitorFields {...props} index={index} />}
      {category === 'cache' && (
        <>
          <Toggle
            label={t('enableKV')}
            value={config.cache.kvBinding !== undefined}
            onChange={(on) =>
              change((c) => {
                c.cache = on ? { kvBinding: 'UPTIMEPAGE_KV' } : {};
              })
            }
          />
          {config.cache.kvBinding !== undefined && (
            <Field
              label={t('kvBinding')}
              value={config.cache.kvBinding}
              onChange={(name) =>
                change((c) => {
                  c.cache.kvBinding = name;
                })
              }
            />
          )}
          <p className="ce-hint">{t('kvHint')}</p>
        </>
      )}
    </div>
  );
}

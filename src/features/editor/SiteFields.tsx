import { Field, LocalizedField, Reorder, Toggle, move, type FormProps } from './fields.tsx';
export function SiteFields({ config, change, language, t }: FormProps) {
  const site = config.site;
  return (
    <>
      <LocalizedField
        label={t('name')}
        value={site.name}
        language={language}
        onChange={(name) =>
          change((c) => {
            c.site.name = name!;
          })
        }
      />
      <Field
        label={t('logo')}
        value={site.logo ?? ''}
        onChange={(logo) =>
          change((c) => {
            c.site.logo = logo || null;
          })
        }
      />
      <div className="ce-columns">
        <Field
          label={t('interval')}
          type="number"
          value={
            Number.isNaN(site.refreshIntervalSeconds) ? '' : String(site.refreshIntervalSeconds)
          }
          onChange={(v) =>
            change((c) => {
              c.site.refreshIntervalSeconds = v === '' ? NaN : Number(v);
            })
          }
        />
        <Toggle
          label={t('pin')}
          value={site.pinAbnormal}
          onChange={(v) =>
            change((c) => {
              c.site.pinAbnormal = v;
            })
          }
        />
      </div>
      <p className="ce-hint">{t('manualHint')}</p>
      <div className="ce-section">
        <strong>{t('nav')}</strong>
        <button
          className="ce-button"
          onClick={() =>
            change((c) => {
              c.site.nav.push({
                label: { en: 'New link', 'zh-CN': '新链接' },
                href: 'https://example.com',
                newTab: true,
              });
            })
          }
        >
          ＋ {t('add')}
        </button>
      </div>
      {site.nav.map((item, i) => (
        <div className="ce-box" key={i}>
          <div className="ce-box-head">
            <span>
              {t('link')} {i + 1}
            </span>
            <Reorder
              index={i}
              count={site.nav.length}
              t={t}
              onMove={(delta) => change((c) => move(c.site.nav, i, delta))}
              onRemove={() =>
                change((c) => {
                  c.site.nav.splice(i, 1);
                })
              }
            />
          </div>
          <LocalizedField
            label={t('label')}
            value={item.label}
            language={language}
            onChange={(label) =>
              change((c) => {
                c.site.nav[i].label = label!;
              })
            }
          />
          <Field
            label={t('link')}
            value={item.href}
            onChange={(href) =>
              change((c) => {
                c.site.nav[i].href = href;
              })
            }
          />
          <Toggle
            label={t('newTab')}
            value={item.newTab}
            onChange={(v) =>
              change((c) => {
                c.site.nav[i].newTab = v;
              })
            }
          />
        </div>
      ))}
      <div className="ce-section">
        <strong>{t('footer')}</strong>
      </div>
      <LocalizedField
        label={t('footer')}
        value={site.footer}
        language={language}
        optional
        onChange={(value) =>
          change((c) => {
            c.site.footer = value ?? '';
          })
        }
      />
      <p className="ce-hint">{t('footerHint')}</p>
    </>
  );
}

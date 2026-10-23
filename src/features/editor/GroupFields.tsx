import {
  Field,
  ListField,
  LocalizedField,
  LinkPolicy,
  Reorder,
  move,
  uniqueId,
  type FormProps,
} from './fields.tsx';
import { toastStore } from '../toasts/store.ts';
import type { SiteConfig } from '../../../config/schema.ts';
export function GroupFields({
  config,
  change,
  language,
  t,
  index,
  onSelect,
}: FormProps & { index: number; onSelect: (i: number) => void }) {
  const group = config.groups[index];
  return (
    <>
      <div className="ce-box-head">
        <strong>{t('group')}</strong>
        <div className="ce-actions">
          <Reorder
            index={index}
            removeDisabled={config.groups.length === 1}
            count={config.groups.length}
            t={t}
            onMove={(delta) => {
              change((c) => move(c.groups, index, delta));
              onSelect(index + delta);
            }}
            onRemove={() => {
              if (config.groups.length < 2) return;
              change((c) => {
                c.groups.splice(index, 1);
              });
              onSelect(Math.max(0, index - 1));
            }}
          />
        </div>
      </div>
      <div className="ce-columns">
        <Field
          label={t('id')}
          value={group.id}
          onChange={(id) =>
            change((c) => {
              c.groups[index].id = id;
            })
          }
        />
        <LocalizedField
          label={t('name')}
          value={group.name}
          language={language}
          onChange={(name) =>
            change((c) => {
              c.groups[index].name = name!;
            })
          }
        />
      </div>
      <Field
        label={t('logo')}
        value={group.logo ?? ''}
        onChange={(logo) =>
          change((c) => {
            c.groups[index].logo = logo || null;
          })
        }
      />
      <LinkPolicy
        t={t}
        value={group.showLinks}
        parentValue={config.site.showLinks}
        onChange={(value) =>
          change((c) => {
            if (value === undefined) delete c.groups[index].showLinks;
            else c.groups[index].showLinks = value;
          })
        }
      />
      <div className="ce-section">
        <strong>{t('source')}</strong>
      </div>
      <div className="ce-source-options">
        {(['peekaping', 'uptimerobot'] as const).map((type) => (
          <button
            key={type}
            className={group.source.type === type ? 'active' : ''}
            aria-pressed={group.source.type === type}
            onClick={() => {
              if (group.source.type === type) return;
              change((c) => {
                const g = c.groups[index];
                g.source =
                  type === 'peekaping'
                    ? {
                        type,
                        baseUrl: 'https://peekaping.example.com',
                        apiKeyEnv: 'PEEKAPING_API_KEY',
                      }
                    : { type, apiKeyEnv: 'UPTIMEROBOT_API_KEY' };
                g.subgroups = g.subgroups.map((s) => ({
                  id: s.id,
                  name: s.name,
                  logo: s.logo,
                  ...(s.showLinks === undefined ? {} : { showLinks: s.showLinks }),
                  ...(type === 'peekaping' ? { slug: s.id } : { monitorIds: ['*'] }),
                }));
              });
              toastStore.push(t('sourceChanged'));
            }}
          >
            {type === 'peekaping' ? 'Peekaping' : 'UptimeRobot'}
          </button>
        ))}
      </div>
      {group.source.type === 'peekaping' && (
        <Field
          label={t('baseUrl')}
          value={group.source.baseUrl}
          onChange={(url) =>
            change((c) => {
              if (c.groups[index].source.type === 'peekaping') c.groups[index].source.baseUrl = url;
            })
          }
        />
      )}
      <Field
        label={t('apiKeyEnv')}
        value={group.source.apiKeyEnv}
        onChange={(name) =>
          change((c) => {
            c.groups[index].source.apiKeyEnv = name;
          })
        }
      />
      <p className="ce-hint">{t('keyHint')}</p>
      <div className="ce-section">
        <strong>{t('subgroups')}</strong>
        <button
          className="ce-button"
          onClick={() =>
            change((c) => {
              const g = c.groups[index];
              g.subgroups.push({
                id: uniqueId(
                  'sub',
                  g.subgroups.map((s) => s.id),
                ),
                name: { en: 'New subgroup', 'zh-CN': '新子分组' },
                logo: null,
                ...(g.source.type === 'peekaping' ? { slug: 'default' } : { monitorIds: ['*'] }),
              });
            })
          }
        >
          ＋ {t('add')}
        </button>
      </div>
      {group.subgroups.map((sub, i) => (
        <div className="ce-box" key={i}>
          <div className="ce-box-head">
            <span>
              {t('subgroup')} {i + 1}
            </span>
            <Reorder
              index={i}
              count={group.subgroups.length}
              t={t}
              onMove={(delta) => change((c) => move(c.groups[index].subgroups, i, delta))}
              onRemove={() =>
                change((c) => {
                  c.groups[index].subgroups.splice(i, 1);
                })
              }
            />
          </div>
          <div className="ce-columns">
            <Field
              label={t('id')}
              value={sub.id}
              onChange={(id) =>
                change((c) => {
                  c.groups[index].subgroups[i].id = id;
                })
              }
            />
            <LocalizedField
              label={t('name')}
              value={sub.name}
              language={language}
              onChange={(name) =>
                change((c) => {
                  c.groups[index].subgroups[i].name = name!;
                })
              }
            />
          </div>
          <Field
            label={t('logo')}
            value={sub.logo ?? ''}
            onChange={(logo) =>
              change((c) => {
                c.groups[index].subgroups[i].logo = logo || null;
              })
            }
          />
          <LinkPolicy
            t={t}
            value={sub.showLinks}
            parentValue={group.showLinks ?? config.site.showLinks}
            onChange={(value) =>
              change((c) => {
                if (value === undefined) delete c.groups[index].subgroups[i].showLinks;
                else c.groups[index].subgroups[i].showLinks = value;
              })
            }
          />
          {group.source.type === 'peekaping' ? (
            <Field
              label={t('slug')}
              value={sub.slug ?? ''}
              onChange={(slug) =>
                change((c) => {
                  c.groups[index].subgroups[i].slug = slug;
                })
              }
            />
          ) : (
            <ListField
              label={t('monitorIds')}
              value={sub.monitorIds ?? []}
              onChange={(ids) =>
                change((c) => {
                  c.groups[index].subgroups[i].monitorIds = ids;
                })
              }
            />
          )}
          <details>
            <summary>{t('ordering')}</summary>
            <ListField
              label={t('order')}
              value={sub.order ?? []}
              onChange={(ids) =>
                change((c) => {
                  if (ids.length) c.groups[index].subgroups[i].order = ids;
                  else delete c.groups[index].subgroups[i].order;
                })
              }
            />
          </details>
        </div>
      ))}
    </>
  );
}
export function newGroup(config: SiteConfig): SiteConfig['groups'][number] {
  return {
    id: uniqueId(
      'group',
      config.groups.map((g) => g.id),
    ),
    name: { en: 'New group', 'zh-CN': '新分组' },
    logo: null,
    source: {
      type: 'peekaping',
      baseUrl: 'https://peekaping.example.com',
      apiKeyEnv: 'PEEKAPING_API_KEY',
    },
    subgroups: [
      { id: 'web', name: { en: 'Websites', 'zh-CN': '网站' }, logo: null, slug: 'default' },
    ],
    monitors: {},
  };
}

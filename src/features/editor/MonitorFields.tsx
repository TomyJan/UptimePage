import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Action, Field, LocalizedField, uniqueId, type FormProps } from './fields.tsx';
import { toastStore } from '../toasts/store.ts';
function MonitorId({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div
      onBlur={() => {
        onChange(text);
        setText(value);
      }}
    >
      <Field label={label} value={text} onChange={setText} />
    </div>
  );
}
export function MonitorFields({
  config,
  change,
  language,
  t,
  index,
}: FormProps & { index: number }) {
  const group = config.groups[index];
  return (
    <>
      <div className="ce-section">
        <strong>{t('overrides')}</strong>
        <button
          className="ce-button"
          onClick={() =>
            change((c) => {
              const g = c.groups[index],
                candidates =
                  g.source.type === 'peekaping'
                    ? g.subgroups.flatMap((s) => [s.id + '-1', s.id + '-2', s.id + '-3'])
                    : g.subgroups.flatMap((s) => s.monitorIds?.filter((id) => id !== '*') ?? []);
              const id =
                candidates.find((id) => !Object.hasOwn(g.monitors, id)) ??
                uniqueId('monitor', Object.keys(g.monitors));
              g.monitors = {
                ...g.monitors,
                [id]: { name: { en: 'Custom monitor', 'zh-CN': '自定义监控' } },
              };
            })
          }
        >
          ＋ {t('add')}
        </button>
      </div>
      <p className="ce-hint">{t('overridesHint')}</p>
      {Object.entries(group.monitors).map(([id, m], i) => (
        <div className="ce-box" key={i}>
          <div className="ce-box-head">
            <span className="mono">{id}</span>
            <Action
              label={t('remove')}
              onClick={() =>
                change((c) => {
                  delete c.groups[index].monitors[id];
                })
              }
            >
              <Trash2 size={13} />
            </Action>
          </div>
          <MonitorId
            label={t('upstreamId')}
            value={id}
            onChange={(value) => {
              if (value === id) return;
              if (!value.trim() || Object.hasOwn(group.monitors, value)) {
                toastStore.push(t('duplicateId'), 5000, 'warning');
                return;
              }
              change((c) => {
                c.groups[index].monitors = Object.fromEntries(
                  Object.entries(c.groups[index].monitors).map(([key, value2]) => [
                    key === id ? value : key,
                    value2,
                  ]),
                );
              });
            }}
          />
          <LocalizedField
            label={t('name')}
            value={m.name}
            language={language}
            optional
            onChange={(name) =>
              change((c) => {
                if (name) c.groups[index].monitors[id].name = name;
                else delete c.groups[index].monitors[id].name;
              })
            }
          />
          <Field
            label={t('logo')}
            value={m.logo ?? ''}
            onChange={(logo) =>
              change((c) => {
                if (logo) c.groups[index].monitors[id].logo = logo;
                else delete c.groups[index].monitors[id].logo;
              })
            }
          />
          <LocalizedField
            label={t('description')}
            value={m.description}
            language={language}
            optional
            onChange={(description) =>
              change((c) => {
                if (description) c.groups[index].monitors[id].description = description;
                else delete c.groups[index].monitors[id].description;
              })
            }
          />
        </div>
      ))}
    </>
  );
}

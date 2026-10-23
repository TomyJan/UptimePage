import { useEffect, useId, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { DataTooltip } from '../../components/DataTooltip.tsx';
import type { LocalizedText, Locale } from '../../shared/contracts.ts';
import type { SiteConfig } from '../../../config/schema.ts';
import type { EditorCopy } from './copy.ts';
import { editLocalizedText } from './draft.ts';

export interface FormProps {
  config: SiteConfig;
  change: (mutate: (config: SiteConfig) => void) => void;
  language: Locale;
  t: EditorCopy;
}
export function Action({
  label,
  children,
  onClick,
  disabled = false,
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <DataTooltip content={label}>
      <button
        type="button"
        className="ce-icon"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    </DataTooltip>
  );
}
export function Field({
  label,
  value,
  onChange,
  area = false,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  area?: boolean;
  type?: 'text' | 'number';
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="ce-field">
      <label htmlFor={id}>{label}</label>
      {area ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          min={type === 'number' ? 0 : undefined}
          step={type === 'number' ? 1 : undefined}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
export function localValue(value: LocalizedText | '' | undefined, locale: Locale) {
  return typeof value === 'string' ? value : (value?.[locale] ?? '');
}
export function LocalizedField({
  label,
  value,
  onChange,
  language,
  optional = false,
}: {
  label: string;
  value: LocalizedText | '' | undefined;
  onChange: (value: LocalizedText | undefined) => void;
  language: Locale;
  optional?: boolean;
}) {
  return (
    <Field
      label={label}
      value={localValue(value, language)}
      onChange={(next) => {
        onChange(editLocalizedText(value, next, language, optional));
      }}
    />
  );
}
const list = (text: string) =>
  text
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
export function ListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [text, setText] = useState(value.join('\n'));
  const serialized = JSON.stringify(value);
  useEffect(() => {
    setText((current) =>
      JSON.stringify(list(current)) === serialized ? current : value.join('\n'),
    );
  }, [serialized]);
  return (
    <Field
      label={label}
      area
      value={text}
      onChange={(next) => {
        setText(next);
        onChange(list(next));
      }}
    />
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="ce-toggle-row">
      <span>{label}</span>
      <button
        type="button"
        className="ce-toggle"
        aria-label={label}
        aria-pressed={value}
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    </div>
  );
}
export function LinkPolicy({
  value,
  parentValue,
  onChange,
  t,
}: {
  value: boolean | undefined;
  parentValue: boolean;
  onChange: (value: boolean | undefined) => void;
  t: EditorCopy;
}) {
  const id = useId();
  return (
    <div className="ce-link-policy">
      <div className="ce-link-policy-heading">
        <span id={id}>{t('showLinks')}</span>
        <small>
          {value === undefined
            ? `${t('inherited')}: ${t(parentValue ? 'shown' : 'hidden')}`
            : t(value ? 'shown' : 'hidden')}
        </small>
      </div>
      <div className="ce-link-options" role="group" aria-labelledby={id}>
        {(['inherit', 'show', 'hide'] as const).map((key) => {
          const next = key === 'inherit' ? undefined : key === 'show';
          return (
            <button
              key={key}
              type="button"
              aria-pressed={value === next}
              onClick={() => onChange(next)}
            >
              {t(key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function Reorder({
  index,
  count,
  onMove,
  onRemove,
  t,
  removeDisabled = false,
}: {
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
  t: EditorCopy;
  removeDisabled?: boolean;
}) {
  return (
    <div className="ce-actions">
      <Action label={t('up')} onClick={() => onMove(-1)} disabled={index === 0}>
        <ArrowUp size={13} />
      </Action>
      <Action label={t('down')} onClick={() => onMove(1)} disabled={index === count - 1}>
        <ArrowDown size={13} />
      </Action>
      <Action label={t('remove')} onClick={onRemove} disabled={removeDisabled}>
        <Trash2 size={13} />
      </Action>
    </div>
  );
}
export function move<T>(array: T[], index: number, delta: number) {
  const next = index + delta;
  if (next >= 0 && next < array.length) [array[index], array[next]] = [array[next], array[index]];
}
export function uniqueId(prefix: string, ids: string[]) {
  let i = 1;
  while (ids.includes(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}

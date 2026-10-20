import { useId, useRef, useLayoutEffect } from 'react';
import { Logo } from '../../components/Logo.tsx';
import type { PublicSubgroup } from '../../shared/config.ts';
import { localize } from '../preferences/locale.ts';
import { usePreferences } from '../preferences/store.ts';
export function GroupTabs({
  items,
  selected,
  onChange,
  label,
  sub = false,
  counts = {},
}: {
  items: PublicSubgroup[];
  selected: string;
  onChange: (id: string) => void;
  label: string;
  sub?: boolean;
  counts?: Record<string, number | undefined>;
}) {
  const { locale } = usePreferences(),
    id = useId();
  const root = useRef<HTMLDivElement>(null),
    indicator = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const active = root.current?.querySelector<HTMLButtonElement>('[aria-selected=true]');
    if (!active || !indicator.current) return;
    const measure = () => {
      const inset = sub ? 0 : 12;
      indicator.current!.style.width = `${Math.max(0, active.offsetWidth - inset * 2)}px`;
      indicator.current!.style.transform = `translateX(${active.offsetLeft + inset}px)`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root.current!);
    observer.observe(active);
    return () => observer.disconnect();
  }, [selected, locale, sub]);
  return (
    <div
      ref={root}
      className={sub ? 'sub-tabs' : 'group-tabs'}
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => {
        const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]'));
        const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
        let next = -1;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = tabs.length - 1;
        if (next >= 0) {
          e.preventDefault();
          tabs[next].focus();
          tabs[next].click();
        }
      }}
    >
      {items.map((item) => (
        <button
          type="button"
          role="tab"
          key={item.id}
          id={`${id}-${item.id}`}
          aria-selected={selected === item.id}
          tabIndex={selected === item.id ? 0 : -1}
          className={selected === item.id ? 'active' : ''}
          onClick={() => onChange(item.id)}
        >
          {item.id !== 'all' && <Logo src={item.logo} name={localize(item.name, locale)} />}
          <span>{localize(item.name, locale)}</span>
          {counts[item.id] !== undefined && <span className="count">{counts[item.id]}</span>}
        </button>
      ))}
      <span
        ref={indicator}
        className={sub ? 'sub-indicator' : 'tab-indicator'}
        aria-hidden="true"
      />
    </div>
  );
}

import type { Locale } from '../../shared/contracts.ts';
export function formatInterval(seconds: number | null, locale: Locale): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const units = locale === 'zh-CN' ? [' 天', ' 小时', ' 分钟', ' 秒'] : ['d', 'h', 'm', 's'];
  const parts: string[] = [];
  let remaining = seconds;
  [86400, 3600, 60, 1].forEach((unit, i) => {
    const value = i === 3 ? Number(remaining.toFixed(3)) : Math.floor(remaining / unit);
    if (value)
      parts.push(
        `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value)}${units[i]}`,
      );
    remaining -= value * unit;
  });
  return parts.join(' ');
}

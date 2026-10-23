/** Only explicit web targets are public links; never infer one from a hostname or IP. */
export function normalizeMonitorUrl(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    !/^https?:\/\//i.test(value) ||
    /[\u0000-\u0020\u007f\\]/.test(value)
  )
    return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

type LinkGroup = {
  showLinks?: boolean;
  subgroups: { id: string; showLinks?: boolean }[];
};

export function monitorLinkVisible(
  group: LinkGroup,
  subgroupIds: string[],
  selected = 'all',
  siteDefault = false,
): boolean {
  return group.subgroups.some(
    (subgroup) =>
      subgroupIds.includes(subgroup.id) &&
      (selected === 'all' || selected === subgroup.id) &&
      (subgroup.showLinks ?? group.showLinks ?? siteDefault),
  );
}

/** Apply again at public/cache boundaries so private targets cannot survive a response merge. */
export function withMonitorLink<T extends { url?: string; subgroupIds: string[] }>(
  monitor: T,
  group: LinkGroup,
): T {
  const { url, ...rest } = monitor;
  const target = monitorLinkVisible(group, monitor.subgroupIds)
    ? normalizeMonitorUrl(url)
    : undefined;
  return { ...rest, ...(target ? { url: target } : {}) } as T;
}

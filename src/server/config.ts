import type { SiteConfig } from '../../config/schema.ts';

export type ServerConfig = {
  configVersion: string;
  groups: SiteConfig['groups'];
};

export type PublicMonitorRef = {
  id: string;
  subgroupIds: string[];
};

export function findServerGroup(config: ServerConfig, groupId: string) {
  return config.groups.find((group) => group.id === groupId) ?? null;
}

/**
 * Returns the configured UptimeRobot monitor allowlist. Peekaping is resolved
 * from a live status page later, so it intentionally returns null here.
 */
export function configuredMonitorIds(group: SiteConfig['groups'][number]): Set<string> | null {
  if (group.source.type !== 'uptimerobot') return null;
  return new Set(group.subgroups.flatMap((subgroup) => subgroup.monitorIds ?? []));
}

export function configuredMonitorRefs(group: SiteConfig['groups'][number]): PublicMonitorRef[] {
  const ids = configuredMonitorIds(group);
  if (!ids) return [];
  return [...ids].map((id) => ({
    id,
    subgroupIds: group.subgroups
      .filter((subgroup) => subgroup.monitorIds?.includes(id))
      .map((subgroup) => subgroup.id),
  }));
}

export function requireSecret(
  environment: Record<string, string | undefined>,
  variable: string,
): string {
  const value = environment[variable]?.trim();
  if (!value) throw new Error(`Missing server secret: ${variable}`);
  return value;
}

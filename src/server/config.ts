import { SourceRequestError } from './sources/http.ts';
import { createHash } from 'node:crypto';
import type { SiteConfig } from '../../config/schema.ts';

export type ServerConfig = {
  configVersion: string;
  cache: SiteConfig['cache'];
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
 * Explicit UptimeRobot IDs can be rejected early. Wildcard and Peekaping
 * membership are resolved from the source snapshot, so return null here.
 */
export function configuredMonitorIds(group: SiteConfig['groups'][number]): Set<string> | null {
  if (
    group.source.type !== 'uptimerobot' ||
    group.subgroups.some((s) => s.monitorIds?.includes('*'))
  )
    return null;
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
  if (!value)
    throw new SourceRequestError('Server credential missing', null, null, {
      reason: 'configuration',
    });
  return value;
}

/** Cache identity changes with the credential, without storing the credential in URLs. */
export function credentialCacheVersion(version: string, scope: string, credential: string) {
  const digest = createHash('sha256').update(credential).digest('hex');
  return `${version}-${scope}-${digest}`;
}

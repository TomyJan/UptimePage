import type { GroupSnapshot } from '../shared/contracts.ts';
import type { CompactGroup } from '../shared/home.ts';
import { buildHistoryCells } from '../shared/history.ts';

export function encodeGroupSnapshot(snapshot: GroupSnapshot): CompactGroup {
  const from = new Date(Date.parse(snapshot.fetchedAt) - 86400000).toISOString();
  return {
    format: 'home-v1',
    groupId: snapshot.groupId,
    fetchedAt: snapshot.fetchedAt,
    configVersion: snapshot.configVersion,
    freshness: snapshot.freshness,
    ...(snapshot.revokedMonitorIds?.length
      ? { revokedMonitorIds: snapshot.revokedMonitorIds }
      : {}),
    subgroups: snapshot.subgroups,
    subgroupErrors: snapshot.subgroupErrors,
    monitors: snapshot.monitors.map((m) => ({
      id: m.id,
      name: m.name,
      state: m.state,
      freshness: m.freshness,
      ...(m.logo ? { logo: m.logo } : {}),
      ...(m.description ? { description: m.description } : {}),
      observedAt: m.observedAt,
      responseMs: m.responseMs,
      sampleIntervalSeconds: m.sampleIntervalSeconds,
      uptime24h: m.uptime24h.value,
      history: buildHistoryCells(m.history, from, snapshot.fetchedAt, m.sampleIntervalSeconds).map(
        (cell) => [
          cell.state,
          cell.responseMs === null ? null : Math.round(cell.responseMs * 100) / 100,
        ],
      ),
    })),
  };
}

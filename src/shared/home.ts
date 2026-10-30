import { z } from 'zod';
import { groupSnapshotSchema, monitorSummarySchema, type GroupSnapshot } from './contracts.ts';

const cellSchema = z.tuple([
  z.enum([
    'operational',
    'down',
    'pending',
    'maintenance',
    'paused',
    'unknown',
    'partial',
    'no-data',
  ]),
  z.number().finite().nonnegative().nullable(),
]);
const homeMonitorSchema = monitorSummarySchema
  .pick({
    id: true,
    name: true,
    state: true,
    freshness: true,
    observedAt: true,
    responseMs: true,
    sampleIntervalSeconds: true,
  })
  .extend({
    logo: monitorSummarySchema.shape.logo.optional(),
    description: monitorSummarySchema.shape.description.optional(),
    url: monitorSummarySchema.shape.url,
    uptime24h: z.number().min(0).max(100).nullable(),
    history: z.array(cellSchema).min(1).max(48),
  });
export const compactGroupSchema = groupSnapshotSchema.omit({ monitors: true }).extend({
  format: z.literal('home-v1'),
  monitors: z.array(homeMonitorSchema),
});
export type CompactGroup = z.infer<typeof compactGroupSchema>;

/** Dates, metric bounds and membership are shared instead of repeated in every card/cell. */
export function decodeGroupSnapshot(wire: CompactGroup): GroupSnapshot {
  const { format: _, ...group } = wire;
  const end = Date.parse(wire.fetchedAt),
    start = end - 86400000;
  const from = new Date(start).toISOString();
  const membership = new Map<string, string[]>();
  for (const subgroup of group.subgroups)
    for (const id of subgroup.monitorIds) {
      const ids = membership.get(id) ?? [];
      if (!ids.includes(subgroup.id)) ids.push(subgroup.id);
      membership.set(id, ids);
    }
  return {
    ...group,
    monitors: wire.monitors.map((m) => ({
      ...m,
      groupId: group.groupId,
      subgroupIds: membership.get(m.id) ?? [],
      logo: m.logo ?? null,
      description: m.description ?? null,
      uptime24h: { value: m.uptime24h, from, until: group.fetchedAt, basis: 'provider' },
      history: m.history.map(([state, responseMs], i) => ({
        from: new Date(start + (i * 86400000) / m.history.length).toISOString(),
        until: new Date(start + ((i + 1) * 86400000) / m.history.length).toISOString(),
        state,
        responseMs,
      })),
    })),
  };
}
// Accept compact and full responses during rolling deployments without extra requests.
export const groupResponseSchema = z.union([
  compactGroupSchema.transform(decodeGroupSnapshot),
  groupSnapshotSchema,
]);

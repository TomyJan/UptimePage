import { z } from 'zod';

export const localeSchema = z.enum(['zh-CN', 'en']);
export const localizedTextSchema = z.union([
  z.string().min(1),
  z.object({ en: z.string().min(1), 'zh-CN': z.string().min(1).optional() }).strict(),
]);
export const monitorStateSchema = z.enum([
  'operational',
  'down',
  'pending',
  'maintenance',
  'paused',
  'unknown',
]);
export const freshnessSchema = z.enum(['fresh', 'stale', 'unavailable']);
export const rangeSchema = z.enum(['24h', '7d', '30d']);
export const apiErrorCodeSchema = z.enum([
  'not-found',
  'unavailable',
  'rate-limited',
  'invalid-response',
]);
export const diagnosticSchema = z.object({
  reason: z.enum([
    'configuration',
    'upstream-http',
    'upstream-rejected',
    'timeout',
    'network',
    'invalid-response',
    'internal',
    'edge-runtime',
  ]),
  status: z.number().int().min(100).max(599).optional(),
  stage: z.enum(['source', 'membership', 'detail', 'runtime']).optional(),
});
export type Diagnostic = z.infer<typeof diagnosticSchema>;
const utc = z.iso.datetime({ offset: false });
const finite = z.number().finite();
export const metricSchema = z.object({
  value: finite.nullable(),
  from: utc.nullable(),
  until: utc.nullable(),
  basis: z.enum(['provider', 'observed-samples']),
});
export const historyBucketSchema = z
  .object({
    from: utc,
    until: utc,
    state: z.union([monitorStateSchema, z.enum(['partial', 'no-data'])]),
    responseMs: finite.nonnegative().nullable(),
  })
  .refine((b) => Date.parse(b.from) < Date.parse(b.until), 'History interval must be ordered');
export const monitorSummarySchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  subgroupIds: z.array(z.string()),
  name: localizedTextSchema,
  logo: z.string().nullable(),
  description: localizedTextSchema.nullable(),
  state: monitorStateSchema,
  freshness: freshnessSchema,
  observedAt: utc.nullable(),
  responseMs: finite.nonnegative().nullable(),
  type: z.string().nullable().optional(),
  intervalSeconds: finite.positive().nullable().optional(),
  sampleIntervalSeconds: finite.positive().nullable().optional(),
  sourceName: z.string().nullable().optional(),
  uptime24h: metricSchema,
  history: z.array(historyBucketSchema),
});
export const groupSnapshotSchema = z.object({
  revokedMonitorIds: z.array(z.string().min(1)).optional(),
  groupId: z.string(),
  fetchedAt: utc,
  configVersion: z.string(),
  freshness: freshnessSchema,
  monitors: z.array(monitorSummarySchema),
  subgroups: z.array(
    z.object({ id: z.string(), monitorIds: z.array(z.string()), freshness: freshnessSchema }),
  ),
  subgroupErrors: z.array(
    z.object({
      subgroupId: z.string(),
      code: apiErrorCodeSchema,
      retryAt: utc.optional(),
      diagnostic: diagnosticSchema.optional(),
    }),
  ),
});
const capability = z.enum(['available', 'unsupported', 'unavailable']);
export const monitorDetailSchema = z.object({
  monitor: monitorSummarySchema,
  fetchedAt: utc,
  configVersion: z.string(),
  range: rangeSchema,
  retryAt: utc.nullable().optional(),
  diagnostic: diagnosticSchema.optional(),
  periodUptime: metricSchema,
  averageResponse: metricSchema,
  certificateExpiresAt: utc.nullable(),
  supportedRanges: z.array(rangeSchema),
  capabilities: z.object({
    history: capability,
    response: capability,
    events: capability,
    certificate: capability,
  }),
  response: z.array(
    z.object({
      at: utc,
      valueMs: finite.nonnegative().nullable(),
      gap: z.literal('short-missing').optional(),
    }),
  ),
  events: z.array(
    z.object({ id: z.string(), from: utc, until: utc.nullable(), state: monitorStateSchema }),
  ),
  type: z.string().nullable(),
  intervalSeconds: finite.positive().nullable(),
  sourceName: z.string().nullable().default(null),
});
export type Locale = z.infer<typeof localeSchema>;
export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type MonitorState = z.infer<typeof monitorStateSchema>;
export type Freshness = z.infer<typeof freshnessSchema>;
export type Range = z.infer<typeof rangeSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type HistoryBucket = z.infer<typeof historyBucketSchema>;
export type MonitorSummary = z.infer<typeof monitorSummarySchema>;
export type GroupSnapshot = z.infer<typeof groupSnapshotSchema>;
export type MonitorDetail = z.infer<typeof monitorDetailSchema>;
export interface ApiClient {
  getGroup(groupId: string, signal: AbortSignal): Promise<GroupSnapshot>;
  getMonitor(
    groupId: string,
    monitorId: string,
    range: Range,
    signal: AbortSignal,
  ): Promise<MonitorDetail>;
}

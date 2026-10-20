import { z } from 'zod';
import { localizedTextSchema } from '../src/shared/contracts.ts';
import type { PublicConfig } from '../src/shared/config.ts';
const id = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens');
const publicUrl = z
  .string()
  .refine(
    (value) => /^\/(?!\/)/.test(value) || /^https:\/\//.test(value),
    'Expected local path or HTTPS URL',
  );
const logo = publicUrl.nullable().default(null);
const footerText = z.union([z.literal(''), localizedTextSchema]).default('');
const cacheConfig = z
  .object({
    kvBinding: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
      .optional(),
  })
  .strict()
  .default({});
const opaqueId = z.string().min(1);
const common = { id, name: localizedTextSchema, logo };
const selector = z
  .object({
    ...common,
    order: z.array(opaqueId).optional(),
    slug: z.string().min(1).optional(),
    monitorIds: z.array(opaqueId).optional(),
  })
  .strict();
const connection = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('peekaping'),
      baseUrl: z.url().refine((v) => new URL(v).protocol === 'https:', 'HTTPS required'),
      apiKeyEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
    })
    .strict(),
  z
    .object({ type: z.literal('uptimerobot'), apiKeyEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/) })
    .strict(),
]);
const schema = z
  .object({
    cache: cacheConfig,
    site: z
      .object({
        name: localizedTextSchema,
        logo,
        nav: z
          .array(z.object({ label: localizedTextSchema, href: publicUrl }).strict())
          .default([]),
        footer: footerText,
        refreshIntervalSeconds: z.number().int().nonnegative().default(60),
        pinAbnormal: z.boolean().default(false),
      })
      .strict(),
    groups: z
      .array(
        z
          .object({
            ...common,
            source: connection,
            subgroups: z.array(selector),
            monitors: z
              .record(
                opaqueId,
                z
                  .object({
                    name: localizedTextSchema.optional(),
                    logo: publicUrl.optional(),
                    description: localizedTextSchema.optional(),
                  })
                  .strict(),
              )
              .default({}),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((config, ctx) => {
    const ids = new Set<string>();
    config.groups.forEach((group, i) => {
      const error = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: 'custom', path: ['groups', i, ...path], message });
      if (ids.has(group.id)) error(['id'], 'Duplicate group ID');
      ids.add(group.id);
      const subIds = new Set<string>();
      group.subgroups.forEach((sub, j) => {
        if (sub.id === 'all' || subIds.has(sub.id))
          error(['subgroups', j, 'id'], 'Duplicate or reserved subgroup ID');
        subIds.add(sub.id);
        if (group.source.type === 'peekaping' && (!sub.slug || sub.monitorIds !== undefined))
          error(['subgroups', j, 'slug'], 'Peekaping requires a status-page slug only');
        if (group.source.type === 'uptimerobot') {
          if (!sub.monitorIds || sub.slug !== undefined)
            error(['subgroups', j, 'monitorIds'], 'UptimeRobot requires monitorIds only');
          if (sub.order?.some((m) => !sub.monitorIds?.includes(m)))
            error(['subgroups', j, 'order'], 'Order references an unselected monitor');
        }
      });
    });
  });
export type SiteConfig = z.infer<typeof schema>;
export interface ServerConfig {
  configVersion: string;
  cache: SiteConfig['cache'];
  groups: SiteConfig['groups'];
}
export function parseConfig(input: unknown): SiteConfig {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      result.error.issues
        .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
        .join('\n'),
    );
  return result.data;
}
export function splitConfig(
  config: SiteConfig,
  configVersion: string,
  build: { commit: string; commitUrl: string } = {
    commit: 'dev',
    commitUrl: 'https://github.com/TomyJan/UptimePage/commits/master',
  },
): { publicConfig: PublicConfig; serverConfig: ServerConfig } {
  return {
    publicConfig: {
      configVersion,
      build,
      site: config.site,
      groups: config.groups.map((group) => ({
        id: group.id,
        name: group.name,
        logo: group.logo,
        subgroups: group.subgroups.map((sub) => ({ id: sub.id, name: sub.name, logo: sub.logo })),
      })),
    },
    serverConfig: { configVersion, cache: config.cache, groups: config.groups },
  };
}

import type { Range } from '../shared/contracts.ts';
export const groupKey = (version: string, groupId: string) => ['group', version, groupId] as const;
export const monitorKey = (version: string, groupId: string, monitorId: string, range: Range) =>
  ['monitor', version, groupId, monitorId, range] as const;

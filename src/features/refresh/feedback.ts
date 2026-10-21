import { ApiClientError } from '../../data/client.ts';
import type { CopyKey } from '../preferences/copy.ts';
export function errorMessage(error: unknown, t: (key: CopyKey) => string): string {
  if (!(error instanceof ApiClientError)) return t('errorInternal');
  const keys = {
    configuration: 'errorConfiguration',
    'upstream-http': 'errorUpstream',
    'upstream-rejected': 'errorRejected',
    timeout: 'errorTimeout',
    network: 'errorNetwork',
    'invalid-response': 'errorInvalid',
    internal: 'errorInternal',
    'edge-runtime': 'errorEdge',
  } as const;
  const reason = error.diagnostic?.reason;
  const text =
    error.code === 'rate-limited' || error.diagnostic?.status === 429
      ? t('errorLimited')
      : reason
        ? t(keys[reason])
        : t(
            error.code === 'not-found'
              ? 'notFound'
              : error.code === 'invalid-response'
                ? 'errorInvalid'
                : 'errorNetwork',
          );
  const status = error.diagnostic?.status;
  return `${text}${status ? ` (HTTP ${status})` : ''}`;
}

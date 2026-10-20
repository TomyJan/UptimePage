export class SourceRequestError extends Error {
  readonly status: number | null;
  readonly retryAt: string | null;

  constructor(message: string, status: number | null = null, retryAt: string | null = null) {
    super(message);
    this.name = 'SourceRequestError';
    this.status = status;
    this.retryAt = retryAt;
  }
}

export type JsonFetcher = typeof fetch;

export async function requestJson(
  fetcher: JsonFetcher,
  url: string,
  init: RequestInit,
  timeoutMs = 8000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, redirect: 'error', signal: controller.signal });
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      const retryTime =
        retryAfter && /^\d+$/.test(retryAfter)
          ? Date.now() + Number(retryAfter) * 1000
          : Date.parse(retryAfter ?? '');
      const retryAt =
        Number.isFinite(retryTime) && Math.abs(retryTime) < 8.64e15
          ? new Date(retryTime).toISOString()
          : null;
      throw new SourceRequestError(
        `Source request failed with HTTP ${response.status}`,
        response.status,
        retryAt,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new SourceRequestError('Source returned invalid JSON');
    }
  } catch (error) {
    if (error instanceof SourceRequestError) throw error;
    if (controller.signal.aborted) throw new SourceRequestError('Source request timed out');
    throw new SourceRequestError('Source request unavailable');
  } finally {
    clearTimeout(timer);
  }
}

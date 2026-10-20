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
    const response = await fetcher(url, { ...init, signal: controller.signal });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      if (!response.ok)
        throw new SourceRequestError('Source returned invalid JSON', response.status);
      throw new SourceRequestError('Source returned invalid JSON', null);
    }
    if (!response.ok) {
      const retryAt = response.headers.get('retry-after');
      throw new SourceRequestError(
        `Source request failed with HTTP ${response.status}`,
        response.status,
        retryAt && /^\d+$/.test(retryAt)
          ? new Date(Date.now() + Number(retryAt) * 1000).toISOString()
          : retryAt,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof SourceRequestError) throw error;
    if (controller.signal.aborted) throw new SourceRequestError('Source request timed out');
    throw new SourceRequestError('Source request unavailable');
  } finally {
    clearTimeout(timer);
  }
}

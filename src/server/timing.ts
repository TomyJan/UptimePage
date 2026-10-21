type Stage = 'membership' | 'snapshot' | 'detail' | 'cache';

/** Fixed labels and numbers only; no request URLs, monitor names or credentials. */
export class RequestTiming {
  private readonly started = performance.now();
  private readonly stages = new Map<Stage, number>();
  upstreamRequests = 0;

  async measure<T>(stage: Stage, work: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await work();
    } finally {
      this.stages.set(stage, (this.stages.get(stage) ?? 0) + performance.now() - start);
    }
  }

  report() {
    return {
      total: Math.round(performance.now() - this.started),
      ...Object.fromEntries([...this.stages].map(([key, value]) => [key, Math.round(value)])),
      upstreamRequests: this.upstreamRequests,
    };
  }

  header() {
    return Object.entries(this.report())
      .filter(([key]) => key !== 'upstreamRequests')
      .map(([key, value]) => `${key};dur=${value}`)
      .join(', ');
  }
}

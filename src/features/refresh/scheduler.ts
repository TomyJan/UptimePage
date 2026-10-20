import { ApiClientError } from '../../data/client.ts';
export interface RefreshResult {
  ok: boolean;
  error?: unknown;
}
/** Owns the single polling deadline; query data owns the last successful snapshot. */
export class RefreshScheduler {
  private request: () => Promise<unknown>;
  private seconds: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private hidden = false;
  private flight: Promise<RefreshResult> | null = null;
  private retryAt = 0;
  deadline = 0;
  constructor(request: () => Promise<unknown>, seconds: number) {
    this.request = request;
    this.seconds = seconds;
  }
  start() {
    this.active = true;
    this.schedule();
  }
  stop() {
    this.active = false;
    clearTimeout(this.timer);
  }
  setInterval(seconds: number) {
    this.seconds = seconds;
    this.deadline = 0;
    this.schedule();
  }
  deferUntil(timestamp: number) {
    if (!Number.isFinite(timestamp)) return;
    this.retryAt = Math.max(this.retryAt, timestamp);
    this.deadline = Math.max(this.deadline, this.retryAt);
    this.schedule(true);
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    clearTimeout(this.timer);
    if (!hidden) this.schedule(true);
  }
  private schedule(preserve = false) {
    clearTimeout(this.timer);
    if (!this.active || this.flight) return;
    if (!this.seconds) {
      this.deadline = 0;
      return;
    }
    if (!preserve || !this.deadline)
      this.deadline = Math.max(Date.now() + this.seconds * 1000, this.retryAt);
    if (!this.hidden)
      this.timer = setTimeout(() => void this.run(false), Math.max(0, this.deadline - Date.now()));
  }
  run(_manual: boolean): Promise<RefreshResult> {
    if (this.flight) return this.flight;
    clearTimeout(this.timer);
    this.flight = Promise.resolve()
      .then(this.request)
      .then(
        () => {
          // A successful HTTP response may still contain stale/partial data
          // with a source retry deadline. Manual refresh must not erase it.
          if (this.retryAt <= Date.now()) this.retryAt = 0;
          return { ok: true };
        },
        (error: unknown) => {
          if (error instanceof ApiClientError && error.retryAt)
            this.retryAt = Date.parse(error.retryAt);
          return { ok: false, error };
        },
      )
      .finally(() => {
        this.flight = null;
        this.schedule();
      });
    return this.flight;
  }
}

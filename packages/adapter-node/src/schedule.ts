import type { Schedule } from "@cable/core";

const MAX_TIMEOUT_MS = 2_147_483_647;

/** One Node timer that re-arms the engine's earliest durable alarm. */
export class NodeSchedule implements Schedule {
  private alarm: () => Promise<void>;
  private due: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(alarm: () => Promise<void>) {
    this.alarm = alarm;
  }

  public async clear(): Promise<void> {
    this.due = null;
    this.clearTimer();
  }

  public async get(): Promise<number | null> {
    return this.due;
  }

  public async set(at: number): Promise<void> {
    if (!Number.isFinite(at)) throw new TypeError("Alarm time must be finite.");
    this.due = at;
    this.arm();
  }

  /** Drop the native timeout during deterministic runtime shutdown. */
  public dispose(): void {
    this.due = null;
    this.clearTimer();
  }

  /** Replace an evicted engine while preserving its durable due time. */
  public setHandler(alarm: () => Promise<void>): void {
    this.alarm = alarm;
  }

  private arm(): void {
    this.clearTimer();
    if (this.due === null) return;
    const delay = Math.max(0, Math.min(this.due - Date.now(), MAX_TIMEOUT_MS));
    this.timer = setTimeout(() => {
      void this.fire().catch(() => undefined);
    }, delay);
  }

  private async fire(): Promise<void> {
    this.timer = undefined;
    const due = this.due;
    if (due === null) return;
    if (due > Date.now()) {
      this.arm();
      return;
    }
    this.due = null;
    await this.alarm();
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

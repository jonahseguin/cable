import type { Schedule } from "@cablejs/core";

/** Engine callback retained by one memory schedule across manual time advances. */
export type AlarmHandler = () => Promise<void>;

/** One manually driven alarm used by an in-memory Host. */
export class MemorySchedule implements Schedule {
  private alarm: AlarmHandler;
  private due: number | null = null;

  constructor(alarm: AlarmHandler) {
    this.alarm = alarm;
  }

  /** Replace the engine callback while preserving the durable alarm time. */
  setHandler(alarm: AlarmHandler): void {
    this.alarm = alarm;
  }

  async set(at: number): Promise<void> {
    if (!Number.isFinite(at)) throw new TypeError("Alarm time must be finite.");
    this.due = at;
  }

  async get(): Promise<number | null> {
    return this.due;
  }

  /** Read the alarm time while the owning clock selects its next callback. */
  dueAt(): number | null {
    return this.due;
  }

  async clear(): Promise<void> {
    this.due = null;
  }

  /** Run and clear an alarm selected by the owning manual clock. */
  async fire(): Promise<void> {
    this.due = null;
    await this.alarm();
  }
}

/** Deterministic shared time for memory Hosts and their single alarms. */
export class ManualClock {
  private readonly schedules = new Set<MemorySchedule>();
  private time: number;

  constructor(start = 0) {
    if (!Number.isFinite(start)) throw new TypeError("Clock start must be finite.");
    this.time = start;
  }

  /** Return the current test time in Unix milliseconds. */
  now(): number {
    return this.time;
  }

  /** Allocate one persistent alarm for a Host. */
  createSchedule(alarm: AlarmHandler): MemorySchedule {
    const schedule = new MemorySchedule(alarm);
    this.schedules.add(schedule);
    return schedule;
  }

  /** Advance time and synchronously drain every alarm due through the target time. */
  async advanceTime(milliseconds: number): Promise<void> {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new TypeError("Clock advance must be a finite, non-negative duration.");
    }
    const target = this.time + milliseconds;
    let alarmCount = 0;
    let next = this.nextDue(target);
    while (next !== undefined) {
      if (alarmCount >= 10_000)
        throw new Error("Manual clock exceeded 10,000 alarms in one advance.");
      alarmCount += 1;
      this.time = Math.max(this.time, next.at);
      // Alarms run sequentially because a callback may re-arm the same capability.
      // eslint-disable-next-line no-await-in-loop
      await next.schedule.fire();
      next = this.nextDue(target);
    }
    this.time = target;
  }

  private nextDue(
    target: number,
  ): { readonly at: number; readonly schedule: MemorySchedule } | undefined {
    let selected: { readonly at: number; readonly schedule: MemorySchedule } | undefined;
    for (const schedule of this.schedules) {
      const at = schedule.dueAt();
      if (at === null || at > target) continue;
      if (selected === undefined || at < selected.at) selected = { at, schedule };
    }
    return selected;
  }
}

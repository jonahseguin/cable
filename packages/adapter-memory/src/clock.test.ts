import { describe, expect, it, vi } from "vitest";

import { ManualClock } from "./clock.js";

describe("ManualClock", () => {
  it("runs alarms in due-time order and advances through re-arming", async () => {
    const clock = new ManualClock(1_000);
    const calls: string[] = [];
    const first = clock.createSchedule(async () => {
      calls.push(`first:${clock.now()}`);
    });
    const second = clock.createSchedule(async () => {
      calls.push(`second:${clock.now()}`);
      await first.set(clock.now() + 5);
    });
    await first.set(1_020);
    await second.set(1_010);

    await clock.advanceTime(25);

    expect(calls).toEqual(["second:1010", "first:1015"]);
    expect(clock.now()).toBe(1_025);
    await expect(first.get()).resolves.toBeNull();
    await expect(second.get()).resolves.toBeNull();
  });

  it("keeps an armed alarm when its callback is replaced", async () => {
    const first = vi.fn<() => Promise<void>>().mockResolvedValue();
    const replacement = vi.fn<() => Promise<void>>().mockResolvedValue();
    const clock = new ManualClock();
    const schedule = clock.createSchedule(first);
    await schedule.set(10);

    schedule.setHandler(replacement);
    await clock.advanceTime(10);

    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledOnce();
  });

  it("rejects invalid time without changing the clock", async () => {
    const clock = new ManualClock(5);
    await expect(clock.advanceTime(-1)).rejects.toThrow("non-negative");
    expect(clock.now()).toBe(5);
  });
});

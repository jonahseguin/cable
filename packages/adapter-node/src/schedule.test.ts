import { afterEach, describe, expect, it, vi } from "vitest";

import { NodeSchedule } from "./schedule.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("NodeSchedule", () => {
  it("replaces the native timer when an earlier alarm is armed", async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const start = Date.now();
    const schedule = new NodeSchedule(async () => {
      calls.push(Date.now());
    });

    await schedule.set(start + 100);
    await schedule.set(start + 20);
    await vi.advanceTimersByTimeAsync(20);

    expect(calls).toEqual([start + 20]);
    await expect(schedule.get()).resolves.toBeNull();
  });

  it("runs the replacement engine callback for an already armed alarm", async () => {
    vi.useFakeTimers();
    const first = vi.fn<() => Promise<void>>().mockResolvedValue();
    const replacement = vi.fn<() => Promise<void>>().mockResolvedValue();
    const schedule = new NodeSchedule(first);
    await schedule.set(Date.now() + 10);

    schedule.setHandler(replacement);
    await vi.advanceTimersByTimeAsync(10);

    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledOnce();
  });
});

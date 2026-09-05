import { describe, expect, it } from "vitest";

import { MemoryStorage } from "./storage.js";

describe("MemoryStorage", () => {
  it("copies values and lists keys in storage order", async () => {
    const storage = new MemoryStorage();
    const value = { nested: { count: 1 } };
    await storage.putMany({
      "ev:0002": value,
      "ev:0001": { order: 1 },
      "pr:1": true,
    });
    value.nested.count = 2;

    const stored = await storage.get<typeof value>("ev:0002");
    expect(stored).toEqual({ nested: { count: 1 } });
    if (stored === undefined) throw new Error("Expected stored value.");
    stored.nested.count = 3;
    await expect(storage.get("ev:0002")).resolves.toEqual({
      nested: { count: 1 },
    });

    await expect(storage.list({ prefix: "ev:" })).resolves.toEqual(
      new Map([
        ["ev:0001", { order: 1 }],
        ["ev:0002", { nested: { count: 1 } }],
      ]),
    );
    await expect(
      storage.list({
        end: "ev:0003",
        limit: 1,
        reverse: true,
        start: "ev:0001",
      }),
    ).resolves.toEqual(new Map([["ev:0002", { nested: { count: 1 } }]]));
  });

  it("commits a transaction as one change", async () => {
    const storage = new MemoryStorage();
    await storage.put("counter", 1);

    const result = await storage.transaction(async (transaction) => {
      const counter = await transaction.get<number>("counter");
      await transaction.putMany({
        counter: (counter ?? 0) + 1,
        event: "created",
      });
      return "committed";
    });

    expect(result).toBe("committed");
    await expect(storage.getMany(["counter", "event"])).resolves.toEqual(
      new Map<string, unknown>([
        ["counter", 2],
        ["event", "created"],
      ]),
    );
  });

  it("rolls back every write when a transaction fails", async () => {
    const storage = new MemoryStorage();
    await storage.putMany({ keep: 1, remove: 2 });

    await expect(
      storage.transaction(async (transaction) => {
        await transaction.put("keep", 3);
        await transaction.delete("remove");
        await transaction.put("new", 4);
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");

    await expect(storage.list({})).resolves.toEqual(
      new Map<string, unknown>([
        ["keep", 1],
        ["remove", 2],
      ]),
    );
  });

  it("keeps concurrent operations outside an unfinished transaction", async () => {
    const storage = new MemoryStorage();
    await storage.put("value", "before");
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const transaction = storage.transaction(async (view) => {
      await view.put("value", "after");
      await gate;
    });
    const observed = storage.get<string>("value");
    let settled = false;
    void observed.then(() => {
      settled = true;
      return undefined;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    release?.();
    await transaction;
    await expect(observed).resolves.toBe("after");
  });
});

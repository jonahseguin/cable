import { describe, expect, it } from "vitest";

import { NodeStorage } from "./storage.js";

describe("NodeStorage", () => {
  it("keeps values after an engine cache is discarded", async () => {
    const storage = new NodeStorage();
    const value = { nested: { count: 1 } };
    await storage.put("ev:0001", value);
    value.nested.count = 2;

    const recovered = await storage.get<typeof value>("ev:0001");

    expect(recovered).toEqual({ nested: { count: 1 } });
    if (recovered === undefined) throw new Error("Expected stored event.");
    recovered.nested.count = 3;
    await expect(storage.get("ev:0001")).resolves.toEqual({ nested: { count: 1 } });
  });

  it("commits a transaction atomically", async () => {
    const storage = new NodeStorage();
    await storage.putMany({ keep: 1, remove: 2 });

    await expect(
      storage.transaction(async (transaction) => {
        await transaction.put("keep", 3);
        await transaction.delete("remove");
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
});

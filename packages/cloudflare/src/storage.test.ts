/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters,
anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion,
typescript/no-unsafe-type-assertion, typescript/no-unsafe-call -- This fake
implements Cloudflare's generic storage overloads so adapter behavior can run
without a workerd process. */
import { describe, expect, it } from "vitest";

import type { CloudflareDurableStorage, CloudflareTransaction } from "./runtime.js";
import { CloudflareStorage } from "./storage.js";

class FakeStorage implements CloudflareDurableStorage, CloudflareTransaction {
  public alarm: number | null = null;
  public readonly multiGetSizes: number[] = [];
  public transactions = 0;
  private readonly values = new Map<string, unknown>();

  public delete(key: string): Promise<boolean>;
  public delete(keys: string[]): Promise<number>;
  public async delete(keyOrKeys: string | string[]): Promise<boolean | number> {
    if (typeof keyOrKeys === "string") return this.values.delete(keyOrKeys);
    let deleted = 0;
    for (const key of keyOrKeys) {
      if (this.values.delete(key)) deleted += 1;
    }
    return deleted;
  }

  public async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }

  public get<T = unknown>(key: string): Promise<T | undefined>;
  public get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
  public async get<T = unknown>(
    keyOrKeys: string | string[],
  ): Promise<T | Map<string, T> | undefined> {
    if (typeof keyOrKeys === "string") return this.values.get(keyOrKeys) as T | undefined;
    this.multiGetSizes.push(keyOrKeys.length);
    const values = new Map<string, T>();
    for (const key of keyOrKeys) {
      if (this.values.has(key)) values.set(key, this.values.get(key) as T);
    }
    return values;
  }

  public async getAlarm(): Promise<number | null> {
    return this.alarm;
  }

  public async list<T = unknown>(
    options: {
      end?: string;
      limit?: number;
      prefix?: string;
      reverse?: boolean;
      start?: string;
    } = {},
  ): Promise<Map<string, T>> {
    let entries = [...this.values.entries()].filter(
      ([key]) =>
        (options.prefix === undefined || key.startsWith(options.prefix)) &&
        (options.start === undefined || key >= options.start) &&
        (options.end === undefined || key < options.end),
    );
    entries.sort(([left], [right]) => left.localeCompare(right));
    if (options.reverse === true) entries.reverse();
    if (options.limit !== undefined) entries = entries.slice(0, options.limit);
    return new Map(entries) as Map<string, T>;
  }

  public put(key: string, value: unknown): Promise<void>;
  public put(entries: Record<string, unknown>): Promise<void>;
  public async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    if (typeof keyOrEntries === "string") {
      this.values.set(keyOrEntries, value);
      return;
    }
    for (const [key, entry] of Object.entries(keyOrEntries)) this.values.set(key, entry);
  }

  public async setAlarm(at: number): Promise<void> {
    this.alarm = at;
  }

  public async transaction<T>(
    operation: (transaction: CloudflareTransaction) => Promise<T>,
  ): Promise<T> {
    this.transactions += 1;
    return operation(this);
  }
}

describe("CloudflareStorage", () => {
  it("chunks multi-key operations and returns stable key order", async () => {
    const runtime = new FakeStorage();
    const storage = new CloudflareStorage(runtime);
    const entries = Object.fromEntries(
      Array.from({ length: 260 }, (_, index) => [
        `key:${String(259 - index).padStart(3, "0")}`,
        index,
      ]),
    );

    await storage.putMany(entries);
    const values = await storage.getMany<number>(Object.keys(entries));
    expect(runtime.multiGetSizes).toEqual([128, 128, 4]);
    expect([...values.keys()]).toEqual([...values.keys()].toSorted());

    await storage.delete(Object.keys(entries));
    expect((await storage.list({ prefix: "key:" })).size).toBe(0);
  });

  it("reuses a transaction scope for nested Cable transactions", async () => {
    const runtime = new FakeStorage();
    const storage = new CloudflareStorage(runtime);

    await storage.transaction(async (outer) => {
      await outer.put("outer", 1);
      await outer.transaction((inner) => inner.put("inner", 2));
    });

    expect(runtime.transactions).toBe(1);
    expect(await storage.getMany<number>(["inner", "outer"])).toEqual(
      new Map([
        ["inner", 2],
        ["outer", 1],
      ]),
    );
  });

  it("preserves list range and ordering semantics", async () => {
    const runtime = new FakeStorage();
    const storage = new CloudflareStorage(runtime);
    await storage.putMany({ "ev:1": 1, "ev:2": 2, "ev:3": 3, other: 4 });

    expect(
      await storage.list<number>({ end: "ev:4", prefix: "ev:", reverse: true, start: "ev:2" }),
    ).toEqual(
      new Map([
        ["ev:3", 3],
        ["ev:2", 2],
      ]),
    );
  });
});

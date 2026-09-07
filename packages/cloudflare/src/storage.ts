/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters,
anti-slop/no-unsafe-dictionary-type, anti-slop/no-known-value-widening --
Cloudflare KV accepts structured-clone values and exposes a structural overload
that this adapter maps to core's similarly generic storage interface. */
import type { Storage, StorageListOptions } from "@cablejs/core";

import type {
  CloudflareDurableStorage,
  CloudflareKvStorage,
  CloudflareTransaction,
} from "./runtime.js";

const MAX_MULTI_KEYS = 128;

/** Adapt Durable Object key-value storage to Cable's portable storage floor. */
export class CloudflareStorage implements Storage {
  private readonly root: CloudflareDurableStorage | undefined;
  private readonly storage: CloudflareKvStorage;

  public constructor(
    storage: CloudflareDurableStorage | CloudflareTransaction,
    transactionScope = false,
  ) {
    this.storage = storage;
    this.root = !transactionScope && hasTransaction(storage) ? storage : undefined;
  }

  public async delete(keys: string | readonly string[]): Promise<void> {
    if (typeof keys === "string") {
      await this.storage.delete(keys);
      return;
    }
    await Promise.all(chunks(keys, MAX_MULTI_KEYS).map((chunk) => this.storage.delete([...chunk])));
  }

  public get<T>(key: string): Promise<T | undefined> {
    return this.storage.get<T>(key);
  }

  public async getMany<T>(keys: readonly string[]): Promise<ReadonlyMap<string, T>> {
    const entries: [string, T][] = [];
    const chunksWithValues = await Promise.all(
      chunks(keys, MAX_MULTI_KEYS).map((chunk) => this.storage.get<T>([...chunk])),
    );
    for (const values of chunksWithValues) entries.push(...values);
    entries.sort(([left], [right]) => left.localeCompare(right));
    return new Map(entries);
  }

  public list<T>(options: StorageListOptions): Promise<ReadonlyMap<string, T>> {
    return this.storage.list<T>(copyListOptions(options));
  }

  public async put(key: string, value: unknown): Promise<void> {
    await this.storage.put(key, value);
  }

  public async putMany(entries: Readonly<Record<string, unknown>>): Promise<void> {
    await Promise.all(
      chunks(Object.entries(entries), MAX_MULTI_KEYS).map((chunk) =>
        this.storage.put(Object.fromEntries(chunk)),
      ),
    );
  }

  public transaction<T>(operation: (transaction: Storage) => Promise<T>): Promise<T> {
    if (this.root === undefined) {
      return operation(this);
    }
    return this.root.transaction((transaction) =>
      operation(new CloudflareStorage(transaction, true)),
    );
  }
}

function hasTransaction(
  storage: CloudflareDurableStorage | CloudflareTransaction,
): storage is CloudflareDurableStorage {
  return "transaction" in storage;
}

function copyListOptions(options: StorageListOptions): {
  end?: string;
  limit?: number;
  prefix?: string;
  reverse?: boolean;
  start?: string;
} {
  const result: {
    end?: string;
    limit?: number;
    prefix?: string;
    reverse?: boolean;
    start?: string;
  } = {};
  if (options.end !== undefined) result.end = options.end;
  if (options.limit !== undefined) result.limit = options.limit;
  if (options.prefix !== undefined) result.prefix = options.prefix;
  if (options.reverse !== undefined) result.reverse = options.reverse;
  if (options.start !== undefined) result.start = options.start;
  return result;
}

function chunks<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

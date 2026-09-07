/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters,
anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type -- Core Storage
deliberately persists opaque engine values; parsing belongs to the engine boundary. */
import type { Storage, StorageListOptions } from "@cablejs/core";

function copy(value: unknown): unknown {
  return structuredClone(value);
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Storage callers select the persisted read type.
function copyAs<T>(value: unknown): T {
  // SAFETY: Storage callers select T. The adapter preserves the stored runtime value through structured clone.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The typed Storage API assigns the read shape to its caller.
  return copy(value) as T;
}

function keys(entries: ReadonlyMap<string, unknown>, options: StorageListOptions): string[] {
  const result = Array.from(entries.keys())
    .filter((key) => options.prefix === undefined || key.startsWith(options.prefix))
    .filter((key) => options.start === undefined || key >= options.start)
    .filter((key) => options.end === undefined || key < options.end);
  result.sort();
  if (options.reverse === true) result.reverse();
  return options.limit === undefined ? result : result.slice(0, options.limit);
}

class TransactionStorage implements Storage {
  private entries: Map<string, unknown>;

  public constructor(entries: Map<string, unknown>) {
    this.entries = entries;
  }

  public async delete(keysToDelete: string | readonly string[]): Promise<void> {
    for (const key of typeof keysToDelete === "string" ? [keysToDelete] : keysToDelete) {
      this.entries.delete(key);
    }
  }

  public async get<T>(key: string): Promise<T | undefined> {
    const value = this.entries.get(key);
    return value === undefined ? undefined : copyAs<T>(value);
  }

  public async getMany<T>(requested: readonly string[]): Promise<ReadonlyMap<string, T>> {
    return readMany<T>(this.entries, requested);
  }

  public async list<T>(options: StorageListOptions): Promise<ReadonlyMap<string, T>> {
    return new Map(
      keys(this.entries, options).map((key) => [key, copyAs<T>(this.entries.get(key))]),
    );
  }

  public async put(key: string, value: unknown): Promise<void> {
    this.entries.set(key, copy(value));
  }

  public async putMany(entries: Readonly<Record<string, unknown>>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) this.entries.set(key, copy(value));
  }

  public async transaction<T>(operation: (transaction: Storage) => Promise<T>): Promise<T> {
    const nested = copyEntries(this.entries);
    const result = await operation(new TransactionStorage(nested));
    this.entries = nested;
    return result;
  }
}

/** Process-local transactional storage retained when a Node Host evicts its engine. */
export class NodeStorage implements Storage {
  private entries = new Map<string, unknown>();
  private pending: Promise<void> = Promise.resolve();

  public delete(keysToDelete: string | readonly string[]): Promise<void> {
    return this.exclusive(async () => {
      for (const key of typeof keysToDelete === "string" ? [keysToDelete] : keysToDelete) {
        this.entries.delete(key);
      }
    });
  }

  public get<T>(key: string): Promise<T | undefined> {
    return this.exclusive(async () => {
      const value = this.entries.get(key);
      return value === undefined ? undefined : copyAs<T>(value);
    });
  }

  public getMany<T>(requested: readonly string[]): Promise<ReadonlyMap<string, T>> {
    return this.exclusive(async () => readMany<T>(this.entries, requested));
  }

  public list<T>(options: StorageListOptions): Promise<ReadonlyMap<string, T>> {
    return this.exclusive(
      async () =>
        new Map(keys(this.entries, options).map((key) => [key, copyAs<T>(this.entries.get(key))])),
    );
  }

  public put(key: string, value: unknown): Promise<void> {
    return this.exclusive(async () => {
      this.entries.set(key, copy(value));
    });
  }

  public putMany(entries: Readonly<Record<string, unknown>>): Promise<void> {
    return this.exclusive(async () => {
      for (const [key, value] of Object.entries(entries)) this.entries.set(key, copy(value));
    });
  }

  public transaction<T>(operation: (transaction: Storage) => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      const transactionEntries = copyEntries(this.entries);
      const result = await operation(new TransactionStorage(transactionEntries));
      this.entries = transactionEntries;
      return result;
    });
  }

  // fallow-ignore-next-line code-duplication -- Node owns this serialized in-memory queue independently of the memory adapter's host lifecycle.
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation, operation);
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function copyEntries(entries: ReadonlyMap<string, unknown>): Map<string, unknown> {
  return new Map(Array.from(entries, ([key, value]) => [key, copy(value)]));
}

function readMany<T>(
  entries: ReadonlyMap<string, unknown>,
  requested: readonly string[],
): Map<string, T> {
  const result = new Map<string, T>();
  for (const key of requested) {
    const value = entries.get(key);
    if (value !== undefined) result.set(key, copyAs<T>(value));
  }
  return result;
}

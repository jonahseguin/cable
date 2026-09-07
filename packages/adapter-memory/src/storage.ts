import type { Storage, StorageListOptions } from "@cablejs/core";

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- Core Storage deliberately persists opaque values; schema parsing belongs to the engine boundary. */
function copyValue(value: unknown): unknown {
  return structuredClone(value);
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Storage callers select T when reading an opaque value.
function copyStoredValue<T>(value: unknown): T {
  // SAFETY: Storage is caller-typed; cloning preserves the stored value's runtime shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is selected by the Storage caller.
  return copyValue(value) as T;
}

function copyEntries(entries: ReadonlyMap<string, unknown>): Map<string, unknown> {
  return new Map(Array.from(entries, ([key, value]) => [key, copyValue(value)]));
}

function getStoredValues<T>(
  entries: ReadonlyMap<string, unknown>,
  keys: readonly string[],
): Map<string, T> {
  const found = new Map<string, T>();
  for (const key of keys) {
    const value = entries.get(key);
    if (value !== undefined) found.set(key, copyStoredValue<T>(value));
  }
  return found;
}

function selectedKeys(
  entries: ReadonlyMap<string, unknown>,
  options: StorageListOptions,
): string[] {
  const keys = Array.from(entries.keys())
    .filter((key) => options.prefix === undefined || key.startsWith(options.prefix))
    .filter((key) => options.start === undefined || key >= options.start)
    .filter((key) => options.end === undefined || key < options.end);
  keys.sort();
  if (options.reverse === true) keys.reverse();
  return options.limit === undefined ? keys : keys.slice(0, options.limit);
}

class TransactionStorage implements Storage {
  private entries: Map<string, unknown>;

  constructor(entries: Map<string, unknown>) {
    this.entries = entries;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.entries.get(key);
    return value === undefined ? undefined : copyStoredValue<T>(value);
  }

  async getMany<T>(keys: readonly string[]): Promise<Map<string, T>> {
    return getStoredValues<T>(this.entries, keys);
  }

  async put(key: string, value: unknown): Promise<void> {
    this.entries.set(key, copyValue(value));
  }

  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Implements core's open Storage KV capability.
  async putMany(entries: Readonly<Record<string, unknown>>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      this.entries.set(key, copyValue(value));
    }
  }

  async delete(keys: string | readonly string[]): Promise<void> {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Storage accepts one key or a key list.
    for (const key of typeof keys === "string" ? [keys] : keys) this.entries.delete(key);
  }

  async list<T>(options: StorageListOptions): Promise<Map<string, T>> {
    return new Map(
      selectedKeys(this.entries, options).map((key) => [
        key,
        copyStoredValue<T>(this.entries.get(key)),
      ]),
    );
  }

  async transaction<T>(callback: (transaction: Storage) => Promise<T>): Promise<T> {
    const nestedEntries = copyEntries(this.entries);
    const result = await callback(new TransactionStorage(nestedEntries));
    this.entries = nestedEntries;
    return result;
  }
}

/** In-memory KV storage with serialized, isolated transactions and rollback. */
export class MemoryStorage implements Storage {
  private entries = new Map<string, unknown>();
  private pending: Promise<void> = Promise.resolve();

  get<T>(key: string): Promise<T | undefined> {
    return this.exclusive(async () => {
      const value = this.entries.get(key);
      return value === undefined ? undefined : copyStoredValue<T>(value);
    });
  }

  getMany<T>(keys: readonly string[]): Promise<Map<string, T>> {
    return this.exclusive(async () => getStoredValues<T>(this.entries, keys));
  }

  put(key: string, value: unknown): Promise<void> {
    return this.exclusive(async () => {
      this.entries.set(key, copyValue(value));
    });
  }

  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Implements core's open Storage KV capability.
  putMany(entries: Readonly<Record<string, unknown>>): Promise<void> {
    return this.exclusive(async () => {
      for (const [key, value] of Object.entries(entries)) {
        this.entries.set(key, copyValue(value));
      }
    });
  }

  delete(keys: string | readonly string[]): Promise<void> {
    return this.exclusive(async () => {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Storage accepts one key or a key list.
      for (const key of typeof keys === "string" ? [keys] : keys) this.entries.delete(key);
    });
  }

  list<T>(options: StorageListOptions): Promise<Map<string, T>> {
    return this.exclusive(
      async () =>
        new Map(
          selectedKeys(this.entries, options).map((key) => [
            key,
            copyStoredValue<T>(this.entries.get(key)),
          ]),
        ),
    );
  }

  transaction<T>(callback: (transaction: Storage) => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      const transactionEntries = copyEntries(this.entries);
      const result = await callback(new TransactionStorage(transactionEntries));
      this.entries = transactionEntries;
      return result;
    });
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation, operation);
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

import type { Storage, StorageListOptions } from "../host.js";

const USER_PREFIX = "u:";

/** A channel event persisted for replay and history. */
export interface StoredEvent {
  readonly at: number;
  readonly d: unknown;
  readonly ev: string;
  readonly target?: { readonly cid?: string; readonly uid?: string };
}

/** One connection's latest presence value. */
export interface StoredPresence {
  readonly at: number;
  readonly cid: string;
  readonly d: unknown;
  readonly uid?: string;
}

/** A durable alarm entry. Failed entries are moved to a later due key. */
export interface StoredTimer {
  readonly args: unknown;
  readonly attempt: number;
  readonly id: string;
  readonly kind: string;
}

interface MutableStorageListOptions {
  end?: string;
  limit?: number;
  prefix?: string;
  reverse?: boolean;
  start?: string;
}

export const ENGINE_KEYS = Object.freeze({
  oldest: "meta:oldest",
  sequence: "meta:seq",
});

export const ENGINE_PREFIXES = Object.freeze({
  event: "ev:",
  grant: "gr:",
  presence: "pr:",
  timer: "tm:",
});

export function eventKey(sequence: number): string {
  return `${ENGINE_PREFIXES.event}${paddedInteger(sequence)}`;
}

export function grantKey(grantId: string): string {
  return `${ENGINE_PREFIXES.grant}${grantId}`;
}

export function presenceKey(connectionId: string): string {
  return `${ENGINE_PREFIXES.presence}${connectionId}`;
}

export function timerKey(due: number, id: string): string {
  return `${ENGINE_PREFIXES.timer}${paddedInteger(due)}:${id}`;
}

export function timerEndKey(due: number): string {
  return `${ENGINE_PREFIXES.timer}${paddedInteger(due)};`;
}

export function sequenceFromEventKey(key: string): number {
  return Number(key.slice(ENGINE_PREFIXES.event.length));
}

export function dueFromTimerKey(key: string): number {
  const value = key.slice(ENGINE_PREFIXES.timer.length).split(":", 1)[0];
  return Number(value);
}

/** Prefixes every user key so application state cannot collide with engine state. */
export class UserStorage implements Storage {
  private readonly storage: Storage;

  public constructor(storage: Storage) {
    this.storage = storage;
  }

  public delete(keys: string | readonly string[]): Promise<void> {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Storage.delete declares a closed string-or-array domain; this selects its two representations.
    const scopedKeys = typeof keys === "string" ? userKey(keys) : keys.map((key) => userKey(key));
    return this.storage.delete(scopedKeys);
  }

  public async get<T>(key: string): Promise<T | undefined> {
    return this.storage.get<T>(userKey(key));
  }

  public async getMany<T>(keys: readonly string[]): Promise<ReadonlyMap<string, T>> {
    const values = await this.storage.getMany<T>(keys.map((key) => userKey(key)));
    return stripUserKeys(values);
  }

  public async list<T>(options: StorageListOptions): Promise<ReadonlyMap<string, T>> {
    const scoped: MutableStorageListOptions = { prefix: userKey(options.prefix ?? "") };
    if (options.start !== undefined) scoped.start = userKey(options.start);
    if (options.end !== undefined) scoped.end = userKey(options.end);
    if (options.limit !== undefined) scoped.limit = options.limit;
    if (options.reverse !== undefined) scoped.reverse = options.reverse;
    return stripUserKeys(await this.storage.list<T>(scoped));
  }

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Storage is the application KV boundary; schemas belong to the owning application key.
  public put(key: string, value: unknown): Promise<void> {
    return this.storage.put(userKey(key), value);
  }

  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storage.putMany requires an open KV entry map; this wrapper changes keys without reading values.
  public putMany(entries: Readonly<Record<string, unknown>>): Promise<void> {
    const scoped = Object.fromEntries(
      Object.entries(entries).map(([key, value]) => [userKey(key), value] as const),
    );
    return this.storage.putMany(scoped);
  }

  public transaction<T>(operation: (transaction: Storage) => Promise<T>): Promise<T> {
    return this.storage.transaction((transaction) => operation(new UserStorage(transaction)));
  }
}

function paddedInteger(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Storage key value must be a non-negative 16-digit integer");
  }
  return value.toString().padStart(16, "0");
}

function userKey(key: string): string {
  return `${USER_PREFIX}${key}`;
}

function stripUserKeys<T>(values: ReadonlyMap<string, T>): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  for (const [key, value] of values) {
    if (key.startsWith(USER_PREFIX)) {
      result.set(key.slice(USER_PREFIX.length), value);
    }
  }
  return result;
}

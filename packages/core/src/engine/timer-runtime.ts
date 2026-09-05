import { CableError } from "../errors.js";
import type { Host, Storage } from "../host.js";
import type { RpcCall } from "../rpc.js";
import {
  ENGINE_KEYS,
  ENGINE_PREFIXES,
  dueFromTimerKey,
  eventKey,
  sequenceFromEventKey,
  timerEndKey,
  timerKey,
  type StoredEvent,
  type StoredTimer,
} from "./storage.js";

const TIMER_POINTER_PREFIX = "meta:timer:";

export interface TimerRuntime {
  timerExecute(kind: string, args: RpcCall["input"]): Promise<number | undefined>;
  timerHost(): Host;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Timer failures are observational hook inputs and are never interpreted as domain data.
  timerReport(error: unknown, operation: string): Promise<void>;
  timerRetryMs(): number;
}

interface ClaimedTimer {
  readonly key: string;
  readonly record: StoredTimer;
}

export async function scheduleTimer(
  host: Host,
  id: string,
  kind: string,
  at: number,
  args: RpcCall["input"],
): Promise<void> {
  assertScheduleTime(at);
  const key = timerKey(at, id);
  await host.storage.transaction(async (storage) => {
    const pointer = await storage.get<string>(timerPointerKey(id));
    if (pointer !== undefined) await storage.delete(pointer);
    await storage.putMany({
      [key]: { args, attempt: 0, id, kind } satisfies StoredTimer,
      [timerPointerKey(id)]: key,
    });
  });
  await armAlarm(host);
}

export async function scheduleTimerIfEarlier(
  host: Host,
  id: string,
  kind: string,
  at: number,
  args: RpcCall["input"],
): Promise<void> {
  assertScheduleTime(at);
  const changed = await host.storage.transaction(async (storage) => {
    const pointerKey = timerPointerKey(id);
    const pointer = await storage.get<string>(pointerKey);
    const existing = pointer === undefined ? undefined : await storage.get<StoredTimer>(pointer);
    if (pointer !== undefined && existing?.attempt === 0 && dueFromTimerKey(pointer) <= at) {
      return false;
    }
    if (pointer !== undefined) await storage.delete(pointer);
    const key = timerKey(at, id);
    await storage.putMany({
      [key]: { args, attempt: 0, id, kind } satisfies StoredTimer,
      [pointerKey]: key,
    });
    return true;
  });
  if (changed) await armAlarm(host);
}

export async function removeTimer(host: Host, id: string): Promise<void> {
  await host.storage.transaction(async (storage) => {
    const pointerKey = timerPointerKey(id);
    const pointer = await storage.get<string>(pointerKey);
    await storage.delete(pointer === undefined ? pointerKey : [pointer, pointerKey]);
  });
  await armAlarm(host);
}

export async function runTimers(runtime: TimerRuntime): Promise<void> {
  const host = runtime.timerHost();
  const now = host.now();
  const claimed = await claimDueTimers(host.storage, now, runtime.timerRetryMs());
  /* oxlint-disable eslint/no-await-in-loop -- Due timers run serially in key order so application side effects are deterministic. */
  for (const timer of claimed) {
    try {
      const nextDue = await runtime.timerExecute(timer.record.kind, timer.record.args);
      await completeTimer(host.storage, timer, nextDue);
    } catch (error) {
      await runtime.timerReport(error, `timer ${timer.record.kind}`);
    }
  }
  /* oxlint-enable eslint/no-await-in-loop */
  await armAlarm(host);
}

export async function compactEvents(
  storage: Storage,
  now: number,
  retainMs: number,
  maximum: number,
): Promise<number | undefined> {
  return storage.transaction(async (transaction) => {
    const records = [...(await transaction.list<StoredEvent>({ prefix: ENGINE_PREFIXES.event }))];
    const cutoff = now - retainMs;
    let removeCount = Math.max(0, records.length - maximum);
    while (removeCount < records.length) {
      const candidate = records[removeCount];
      if (candidate === undefined || candidate[1].at > cutoff) break;
      removeCount += 1;
    }
    const removed = records.slice(0, removeCount);
    if (removed.length > 0) await transaction.delete(removed.map(([key]) => key));
    const retained = records[removeCount];
    const sequence = (await transaction.get<number>(ENGINE_KEYS.sequence)) ?? 0;
    await transaction.put(
      ENGINE_KEYS.oldest,
      retained === undefined ? sequence + 1 : sequenceFromEventKey(retained[0]),
    );
    return retained === undefined ? undefined : retained[1].at + retainMs;
  });
}

async function claimDueTimers(
  storage: Storage,
  now: number,
  retryMs: number,
): Promise<readonly ClaimedTimer[]> {
  return storage.transaction(async (transaction) => {
    const due = await transaction.list<StoredTimer>({
      end: timerEndKey(now),
      prefix: ENGINE_PREFIXES.timer,
    });
    const claimed: ClaimedTimer[] = [];
    const removed: string[] = [];
    const entries: Array<readonly [string, StoredTimer | string]> = [];
    for (const [oldKey, record] of due) {
      const key = timerKey(now + retryMs, record.id);
      const nextRecord: StoredTimer = { ...record, attempt: record.attempt + 1 };
      removed.push(oldKey);
      entries.push([key, nextRecord], [timerPointerKey(record.id), key]);
      claimed.push({ key, record: nextRecord });
    }
    if (removed.length > 0) await transaction.delete(removed);
    if (entries.length > 0) await transaction.putMany(Object.fromEntries(entries));
    return claimed;
  });
}

async function completeTimer(
  storage: Storage,
  claimed: ClaimedTimer,
  nextDue: number | undefined,
): Promise<void> {
  await storage.transaction(async (transaction) => {
    const pointerKey = timerPointerKey(claimed.record.id);
    const pointer = await transaction.get<string>(pointerKey);
    if (pointer !== claimed.key) return;
    await transaction.delete([claimed.key, pointerKey]);
    if (nextDue === undefined) return;
    assertScheduleTime(nextDue);
    const key = timerKey(nextDue, claimed.record.id);
    await transaction.putMany({
      [key]: { ...claimed.record, attempt: 0 } satisfies StoredTimer,
      [pointerKey]: key,
    });
  });
}

async function armAlarm(host: Host): Promise<void> {
  const next = await host.storage.list<StoredTimer>({ limit: 1, prefix: ENGINE_PREFIXES.timer });
  const first = next.keys().next();
  if (first.done === true) {
    await host.schedule.clear();
    return;
  }
  await host.schedule.set(dueFromTimerKey(first.value));
}

function timerPointerKey(id: string): string {
  return `${TIMER_POINTER_PREFIX}${id}`;
}

function assertScheduleTime(at: number): void {
  if (!Number.isSafeInteger(at) || at < 0) {
    throw new CableError("VALIDATION", { message: "Timer time must be a non-negative integer" });
  }
  eventKey(at);
}

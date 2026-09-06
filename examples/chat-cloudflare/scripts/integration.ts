import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@cable/client";

import { api } from "../src/api.ts";

const port = 8_789;
const endpoint = `http://127.0.0.1:${port}/_cable`;
const secret = "local-integration-secret-with-at-least-32-bytes";
const stateDirectory = await mkdtemp(join(tmpdir(), "cable-chat-cloudflare-"));
const worker = spawn(
  "bunx",
  [
    "wrangler",
    "dev",
    "--local",
    "--port",
    String(port),
    "--var",
    `CABLE_GRANT_SECRET:${secret}`,
    "--persist-to",
    stateDirectory,
  ],
  { cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"] },
);

let output = "";
worker.stdout.on("data", (chunk: Buffer) => {
  output = keepTail(output, chunk.toString());
});
worker.stderr.on("data", (chunk: Buffer) => {
  output = keepTail(output, chunk.toString());
});

try {
  await waitForWorker();
  await verifyChat();
  process.stdout.write("Cloudflare chat integration passed.\n");
} catch (cause) {
  const error = cause instanceof Error ? cause : new Error("Cloudflare chat integration failed.");
  error.message = `${error.message}\n\nWrangler output:\n${output}`;
  throw error;
} finally {
  await stopWorker();
  await rm(stateDirectory, { force: true, recursive: true });
}

function client(name: string) {
  return createClient({
    auth: { token: () => name },
    contract: api,
    url: endpoint,
    ws: { idleClose: 0, reconnect: { jitter: false } },
  });
}

async function verifyChat(): Promise<void> {
  const alice = client("Alice");
  const bob = client("Bob");
  const aliceRoom = alice.chat({ roomId: "integration" });
  const bobRoom = bob.chat({ roomId: "integration" });
  try {
    const received = deferred<{ readonly text: string; readonly user: string }>();
    const offMessage = aliceRoom.on("message", (message) => {
      received.resolve(message);
    });
    const offAlicePresence = aliceRoom.presence.on(() => undefined);
    const offBobPresence = bobRoom.presence.on(() => undefined);
    aliceRoom.presence.update({ name: "Alice" });
    bobRoom.presence.update({ name: "Bob" });
    await Promise.all([waitForOpen(aliceRoom), waitForOpen(bobRoom)]);
    await waitFor(
      () => aliceRoom.presence.others.length === 1 && bobRoom.presence.others.length === 1,
    );
    await bobRoom.send({ text: "Hello from Bob" }, { ack: true });
    const message = await within(received.promise, "Alice did not receive Bob's message");
    equal(message.text, "Hello from Bob", "Unexpected event text");
    equal(message.user, "Bob", "Unexpected event user");

    const history = await aliceRoom.history.load({ limit: 10 });
    equal(history.events.length, 1, "Socket history did not contain the message");
    const session = await alice.session.whoami.query({});
    equal(session.name, "Alice", "Global RPC did not authenticate Alice");

    const fallback = client("Alice").chat({ roomId: "integration" });
    try {
      const info = await fallback.info({});
      equal(info.roomId, "integration", "HTTP host fallback did not return the room");
    } finally {
      fallback.dispose();
    }
    offMessage();
    offAlicePresence();
    offBobPresence();
  } finally {
    aliceRoom.dispose();
    bobRoom.dispose();
  }
}

async function waitForWorker(): Promise<void> {
  await waitFor(async () => {
    try {
      const response = await fetch(`${endpoint}/rpc`, {
        body: JSON.stringify({ calls: [] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      return response.ok;
    } catch {
      return false;
    }
  });
}

function waitForOpen(room: ReturnType<ReturnType<typeof client>["chat"]>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error("Cable client did not open a WebSocket within five seconds."));
    }, 5_000);
    const off = room.onStatus(() => {
      if (room.status !== "open") return;
      clearTimeout(timer);
      off();
      resolve();
    });
  });
}

async function waitFor(condition: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000;
  await waitForCondition(condition, deadline);
}

async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  deadline: number,
): Promise<void> {
  if (await condition()) return;
  if (Date.now() >= deadline) throw new Error("Timed out waiting for local Worker state.");
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 25);
  }).then(() => waitForCondition(condition, deadline));
}

async function within<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(message));
      }, 5_000);
    }),
  ]);
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((next) => {
    settle = next;
  });
  return {
    promise,
    resolve(value) {
      if (settle === undefined) throw new Error("Deferred promise did not initialize.");
      settle(value);
    },
  };
}

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected)
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

async function stopWorker(): Promise<void> {
  if (hasExited()) return;
  worker.kill("SIGINT");
  await Promise.race([
    once(worker, "exit"),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (!hasExited()) worker.kill("SIGKILL");
}

function hasExited(): boolean {
  return worker.exitCode !== null;
}

function keepTail(previous: string, next: string): string {
  return `${previous}${next}`.slice(-4_000);
}

import { createClient } from "@cable/client";

import { api } from "../src/api.ts";
import { waitFor, waitForOpen } from "./chat-await.ts";

export async function verifyChat(endpoint: string, label: string): Promise<void> {
  const client = (name: string) =>
    createClient({
      auth: { token: () => name },
      contract: api,
      url: endpoint,
      ws: { idleClose: 0, reconnect: { jitter: false } },
    });
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
      label,
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
      equal(
        (await fallback.info({})).roomId,
        "integration",
        "HTTP host fallback did not return the room",
      );
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
function within<T>(promise: Promise<T>, message: string): Promise<T> {
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
  readonly resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  if (resolve === undefined) throw new Error("Deferred promise did not initialize.");
  return { promise, resolve };
}
function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected)
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

import { MemorySocket } from "@cablejs/adapter-memory";
import { decodeClientFrame } from "@cablejs/core";
import type { CableDiagnosticEvent, ClientWireFrame, RpcCall } from "@cablejs/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SocketSession } from "../src/socket-session.js";
import type { SocketSessionOptions } from "../src/socket-session.js";

class SocketHarness {
  readonly sockets: MemorySocket[] = [];
  readonly urls: string[] = [];
  readonly received: ClientWireFrame[] = [];
  private readonly tasks: (() => Promise<void> | void)[] = [];

  readonly createSocket = (url: string): MemorySocket => {
    this.urls.push(url);
    const socket = new MemorySocket((operation) => {
      this.tasks.push(operation);
    });
    this.sockets.push(socket);
    socket.accept({
      message: async (data) => {
        this.received.push(decodeClientFrame(data));
      },
      close: async () => {},
      terminate: () => {},
    });
    return socket;
  };

  get socket(): MemorySocket {
    const socket = this.sockets.at(-1);
    if (socket === undefined) throw new Error("The client has not opened a socket.");
    return socket;
  }

  async flush(): Promise<void> {
    await Promise.resolve();
    let task = this.tasks.shift();
    while (task !== undefined) {
      // oxlint-disable-next-line no-await-in-loop -- Socket callbacks run in wire order and can enqueue the next callback.
      await task();
      task = this.tasks.shift();
    }
  }

  host(frame: RpcCall["input"]): void {
    this.socket.receive(JSON.stringify(frame));
  }

  welcome(seq = 0): void {
    this.host({
      t: "welcome",
      v: 1,
      cid: `cid-${this.sockets.length}`,
      seq,
      presence: [],
      replay: [],
    });
  }
}

const sessions: SocketSession[] = [];
function session(
  harness: SocketHarness,
  options: Partial<SocketSessionOptions> = {},
): SocketSession {
  vi.useFakeTimers();
  const connection = new SocketSession({
    url: "https://example.test/_cable",
    key: "chat:lobby",
    params: { roomId: "lobby" },
    createSocket: harness.createSocket,
    reconnect: { base: 100, max: 1000, jitter: false },
    ...options,
  });
  sessions.push(connection);
  return connection;
}

afterEach(() => {
  for (const connection of sessions.splice(0)) connection.dispose();
  vi.useRealTimers();
});

describe("resumable socket sessions", () => {
  it("reports reconnect and reset transitions without channel parameters", async () => {
    const harness = new SocketHarness();
    const events: CableDiagnosticEvent[] = [];
    const connection = session(harness, {
      diagnostics: {
        observe: (event) => {
          events.push(event);
        },
      },
    });
    vi.setSystemTime(0);

    connection.start();
    await harness.flush();
    harness.welcome(3);
    await harness.flush();
    harness.socket.terminate();
    await harness.flush();
    await vi.advanceTimersByTimeAsync(100);
    await harness.flush();
    harness.host({
      cid: "cid-2",
      presence: [],
      replay: [],
      reset: true,
      seq: 3,
      t: "welcome",
      v: 1,
    });
    await harness.flush();

    expect(events).toMatchObject([
      { previous: "closed", runtime: "client", state: "connecting", type: "connection" },
      { previous: "connecting", runtime: "client", state: "open", type: "connection" },
      { previous: "open", runtime: "client", state: "closed", type: "connection" },
      { previous: "closed", runtime: "client", state: "resuming", type: "connection" },
      { previous: "resuming", reset: true, runtime: "client", state: "open", type: "connection" },
    ]);
    expect(events.at(-1)).not.toHaveProperty("key");
    expect(events.at(-1)).not.toHaveProperty("params");
  });

  it("does not start heartbeat timers after queued frame encoding fails", async () => {
    const harness = new SocketHarness();
    const connection = session(harness);
    const pending = Promise.allSettled([connection.request({ t: "emit", ev: "bad", d: 1n })]);
    await harness.flush();
    harness.welcome();
    await harness.flush();
    expect((await pending)[0].status).toBe("rejected");
    expect(connection.status).toBe("closed");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("rejects a queued fire-and-forget write when encoding fails", async () => {
    const harness = new SocketHarness();
    const connection = session(harness);
    const pending = connection.send({ t: "emit", ev: "bad", d: 1n });
    await harness.flush();
    harness.welcome();
    await harness.flush();
    await expect(pending).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(connection.status).toBe("closed");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("commits presented replay events rather than the advertised head and refreshes credentials", async () => {
    const harness = new SocketHarness();
    const cursors = new Map<string, string>();
    let token = "first";
    const connection = session(harness, {
      token: () => token,
      cursors: {
        getItem: (key) => cursors.get(key) ?? null,
        setItem: (key, value) => {
          cursors.set(key, value);
        },
      },
    });
    const values: RpcCall["input"][] = [];
    connection.onFrame((frame) => {
      if (frame.t === "ev") values.push(frame.d);
    });
    connection.start();
    await harness.flush();
    expect(harness.received).toEqual([{ t: "hello", v: 1 }]);
    harness.host({
      t: "welcome",
      v: 1,
      cid: "cid-1",
      seq: 3,
      presence: [],
      replay: [
        { t: "ev", seq: 1, ev: "message", d: "one" },
        { t: "ev", seq: 2, ev: "message", d: "two" },
      ],
      more: true,
    });
    await harness.flush();
    expect([...cursors.values()]).toEqual(["2"]);
    expect(connection.status).not.toBe("open");
    harness.socket.terminate();
    await harness.flush();
    token = "second";
    await vi.advanceTimersByTimeAsync(100);
    await harness.flush();
    expect(harness.received.at(-1)).toEqual({ t: "hello", v: 1, since: 2 });
    expect(harness.urls.map((url) => new URL(url).searchParams.get("token"))).toEqual([
      "first",
      "second",
    ]);
    expect(new URL(harness.urls[0] ?? "").searchParams.get("params")).toBe('{"roomId":"lobby"}');
    harness.host({
      t: "welcome",
      v: 1,
      cid: "cid-2",
      seq: 3,
      presence: [],
      replay: [
        { t: "ev", seq: 2, ev: "message", d: "two" },
        { t: "ev", seq: 3, ev: "message", d: "three" },
      ],
    });
    await harness.flush();
    harness.host({ t: "ev", seq: 3, ev: "message", d: "three" });
    await harness.flush();
    expect(values).toEqual(["one", "two", "three"]);
    expect(connection.status).toBe("open");
    expect([...cursors.values()]).toEqual(["3"]);
  });

  it("queues acknowledged events until welcome and preserves declared error data", async () => {
    const harness = new SocketHarness();
    const connection = session(harness);
    const pending = connection.request({ t: "emit", ev: "send", d: "hello" });
    const rejected = Promise.allSettled([pending]);
    await harness.flush();
    expect(harness.received).toEqual([{ t: "hello", v: 1 }]);
    harness.welcome();
    await harness.flush();
    expect(harness.received.at(-1)).toEqual({ t: "emit", id: "1", ev: "send", d: "hello" });
    harness.host({ t: "res", id: "1", ok: false, e: { code: "MUTED", data: { until: 42 } } });
    await harness.flush();
    expect(await rejected).toMatchObject([
      { status: "rejected", reason: { code: "MUTED", data: { until: 42 } } },
    ]);
  });

  it("marks targeted live events as non-replayed and non-durable", async () => {
    const harness = new SocketHarness();
    const connection = session(harness);
    const metadata: { seq: number | undefined; replayed: boolean }[] = [];
    connection.onFrame((frame, event) => {
      if (frame.t === "evt") metadata.push({ seq: event?.seq, replayed: event?.replayed ?? false });
    });
    connection.start();
    await harness.flush();
    harness.welcome();
    await harness.flush();
    harness.host({ t: "evt", ev: "private", d: "hello" });
    await harness.flush();
    expect(metadata).toEqual([{ seq: undefined, replayed: false }]);
  });

  it("rejects interrupted calls without replaying side effects on reconnect", async () => {
    const harness = new SocketHarness();
    const connection = session(harness);
    connection.start();
    await harness.flush();
    harness.welcome();
    await harness.flush();
    const rejected = Promise.allSettled([connection.request({ t: "call", p: "kick", d: {} })]);
    await harness.flush();
    harness.socket.terminate();
    await harness.flush();
    expect(await rejected).toMatchObject([{ status: "rejected", reason: { code: "UNAVAILABLE" } }]);
    await vi.advanceTimersByTimeAsync(100);
    await harness.flush();
    harness.welcome();
    await harness.flush();
    expect(harness.received.filter((frame) => frame !== "ping" && frame.t === "call")).toHaveLength(
      1,
    );
  });

  it("times out the handshake and then times out an unanswered call", async () => {
    const harness = new SocketHarness();
    const connection = session(harness, { handshakeTimeout: 50, requestTimeout: 40 });
    const errors: Error[] = [];
    connection.onError((error) => {
      errors.push(error);
    });
    connection.start();
    await harness.flush();
    await vi.advanceTimersByTimeAsync(50);
    await harness.flush();
    expect(errors[0]).toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(100);
    await harness.flush();
    harness.welcome();
    await harness.flush();
    const rejected = Promise.allSettled([connection.request({ t: "call", p: "slow", d: null })]);
    await vi.advanceTimersByTimeAsync(40);
    await harness.flush();
    expect(await rejected).toMatchObject([{ status: "rejected", reason: { code: "TIMEOUT" } }]);
  });

  it("honors retry delays and treats a bye without retry as terminal", async () => {
    const harness = new SocketHarness();
    const connection = session(harness);
    connection.start();
    await harness.flush();
    harness.welcome();
    await harness.flush();
    harness.host({ t: "bye", code: 4008, reason: "backpressure", retry: 700 });
    await harness.flush();
    await vi.advanceTimersByTimeAsync(699);
    expect(harness.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await harness.flush();
    expect(harness.sockets).toHaveLength(2);
    harness.welcome();
    await harness.flush();
    harness.host({ t: "bye", code: 4003, reason: "kicked" });
    await harness.flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(connection.status).toBe("closed");
    expect(harness.sockets).toHaveLength(2);
  });

  it("rejects live frames before the welcome barrier and isolates observer failures", async () => {
    const harness = new SocketHarness();
    const connection = session(harness);
    const errors: Error[] = [];
    const frames: string[] = [];
    connection.onFrame(() => {
      throw new Error("observer");
    });
    connection.onFrame((frame) => {
      frames.push(frame.t);
    });
    connection.onError((error) => {
      errors.push(error);
    });
    connection.start();
    await harness.flush();
    harness.host({ t: "ev", seq: 1, ev: "message", d: null });
    await harness.flush();
    expect(errors[0]).toMatchObject({ code: "PARSE_ERROR" });
    expect(frames).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    await harness.flush();
    harness.welcome();
    await harness.flush();
    expect(frames).toEqual(["welcome"]);
    expect(errors.at(-1)?.message).toBe("observer");
    expect(connection.status).toBe("open");
  });
  it("does not reopen or leave timers after disposal inside a welcome observer", async () => {
    const harness = new SocketHarness();
    const connection = session(harness);
    connection.onFrame((frame) => {
      if (frame.t === "welcome") connection.dispose();
    });
    connection.start();
    await harness.flush();
    harness.welcome();
    await harness.flush();
    expect(connection.status).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses literal ping/pong and reconnects when a pong is missing", async () => {
    const harness = new SocketHarness();
    const connection = session(harness);
    const errors: Error[] = [];
    connection.onError((error) => {
      errors.push(error);
    });
    connection.start();
    await harness.flush();
    harness.welcome();
    await harness.flush();
    await vi.advanceTimersByTimeAsync(25_000);
    await harness.flush();
    expect(harness.received.at(-1)).toBe("ping");
    harness.socket.receive("pong");
    await harness.flush();
    await vi.advanceTimersByTimeAsync(25_000);
    await harness.flush();
    expect(connection.status).toBe("open");
    await vi.advanceTimersByTimeAsync(25_000);
    await harness.flush();
    expect(connection.status).toBe("closed");
    expect(errors.at(-1)).toMatchObject({ code: "TIMEOUT" });
  });

  it.each(["cid", "seq", "reset"])(
    "rejects changes to %s between welcome chunks",
    async (field) => {
      const harness = new SocketHarness();
      const connection = session(harness);
      const errors: Error[] = [];
      connection.onError((error) => {
        errors.push(error);
      });
      connection.start();
      await harness.flush();
      const first = { t: "welcome", v: 1, cid: "cid-1", seq: 2, presence: [], replay: [] };
      harness.host({ ...first, more: true });
      await harness.flush();
      harness.host({ ...first, [field]: field === "cid" ? "changed" : field === "seq" ? 3 : true });
      await harness.flush();
      expect(connection.status).toBe("closed");
      expect(errors.at(-1)).toMatchObject({ code: "PARSE_ERROR" });
    },
  );
  it("includes credential resolution in the handshake deadline and ignores late credentials", async () => {
    const harness = new SocketHarness();
    const connection = session(harness, {
      token: () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve("late");
          }, 50);
        }),
      handshakeTimeout: 10,
    });
    const errors: Error[] = [];
    connection.onError((error) => {
      errors.push(error);
    });
    connection.start();
    await vi.advanceTimersByTimeAsync(10);
    await harness.flush();
    expect(errors.at(-1)).toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(40);
    await harness.flush();
    expect(harness.sockets).toHaveLength(0);
    expect(connection.status).toBe("closed");
  });
  it("allows disposal from the first status notification without opening a socket", async () => {
    const harness = new SocketHarness();
    const connection = session(harness);
    connection.onStatus(() => {
      if (connection.status === "connecting") connection.dispose();
    });
    connection.start();
    await harness.flush();
    expect(harness.sockets).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

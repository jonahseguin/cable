import { CableError, decodeHostFrame, encodeClientFrame, encodeInput } from "@cable/core";
import type { ClientFrame, HostFrame, RpcCall } from "@cable/core";

import type { ChannelSocket, ChannelStatus, SocketOptions, Unsubscribe } from "./channel-types.js";

/** Connection credentials are fetched again for every reconnect attempt. */
export interface SocketSessionOptions extends SocketOptions {
  readonly url: string;
  readonly key: string;
  readonly params: RpcCall["input"];
  readonly token?: () => string | undefined | Promise<string | undefined>;
}

interface PendingRequest {
  readonly frame: ClientFrame;
  readonly resolve: (data: RpcCall["input"]) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  sent: boolean;
}

function textMessage(event: MessageEvent): event is MessageEvent<string> {
  return typeof event.data === "string";
}

/** One physical connection and resumable cursor, shared by channel handles. */
export class SocketSession {
  private readonly options: SocketSessionOptions;
  private readonly frames = new Set<(frame: HostFrame) => void>();
  private readonly statuses = new Set<() => void>();
  private readonly errors = new Set<(error: Error) => void>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly queued: ClientFrame[] = [];
  private socket: ChannelSocket | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private handshakeTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private currentStatus: ChannelStatus = "closed";
  private cursor: number | undefined;
  private replayHead: number | undefined;
  private replayReset: boolean | undefined;
  private connectionId: string | undefined;
  private awaitingPong = false;
  private lastActivity = 0;
  private attempt = 0;
  private epoch = 0;
  private nextId = 0;
  private stopped = false;
  private retryDelay: number | undefined;

  constructor(options: SocketSessionOptions) {
    this.options = options;
    try {
      const stored = options.cursors?.getItem(this.cursorKey());
      if (stored !== undefined && stored !== null) {
        const value = Number(stored);
        if (Number.isSafeInteger(value) && value >= 0) this.cursor = value;
      }
    } catch {
      // Browser storage may be unavailable; the in-memory cursor still supports reconnects.
    }
  }

  get status(): ChannelStatus {
    return this.currentStatus;
  }

  onFrame(listener: (frame: HostFrame) => void): Unsubscribe {
    this.frames.add(listener);
    return () => {
      this.frames.delete(listener);
    };
  }

  onStatus(listener: () => void): Unsubscribe {
    this.statuses.add(listener);
    return () => {
      this.statuses.delete(listener);
    };
  }

  onError(listener: (error: Error) => void): Unsubscribe {
    this.errors.add(listener);
    return () => {
      this.errors.delete(listener);
    };
  }

  start(): void {
    if (this.stopped || this.currentStatus !== "closed" || this.retryTimer !== undefined) return;
    this.setStatus(this.cursor === undefined ? "connecting" : "resuming");
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- A status observer may synchronously dispose this session.
    if (this.stopped) return;
    this.handshakeTimer = setTimeout(() => {
      this.fail(new CableError("TIMEOUT"));
    }, this.options.handshakeTimeout ?? 10_000);
    void this.connect(++this.epoch);
  }

  send(frame: ClientFrame): void {
    if (this.stopped) throw new CableError("UNAVAILABLE", { message: "Channel is disposed." });
    if (this.currentStatus === "open") {
      this.write(frame);
      return;
    }
    if (this.queued.length >= 256) throw new CableError("TOO_MANY_REQUESTS");
    this.queued.push(frame);
    this.start();
  }

  request(
    frame:
      | { readonly t: "emit"; readonly ev: string; readonly d: RpcCall["input"] }
      | { readonly t: "call"; readonly p: string; readonly d: RpcCall["input"] },
  ): Promise<RpcCall["input"]> {
    if (this.stopped) return Promise.reject(new CableError("UNAVAILABLE"));
    if (this.pending.size >= 256) return Promise.reject(new CableError("TOO_MANY_REQUESTS"));
    const id = String(++this.nextId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CableError("TIMEOUT"));
      }, this.options.requestTimeout ?? 30_000);
      const request = { frame: { ...frame, id }, resolve, reject, timer, sent: false };
      this.pending.set(id, request);
      if (this.currentStatus === "open") {
        request.sent = true;
        this.write(request.frame);
      } else this.start();
    });
  }

  dispose(): void {
    this.stopped = true;
    this.epoch += 1;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.clearConnectionTimers();
    const socket = this.socket;
    this.socket = undefined;
    socket?.close(1000, "Channel disposed");
    this.rejectPending(new CableError("UNAVAILABLE"));
    this.setStatus("closed");
    this.frames.clear();
    this.statuses.clear();
    this.errors.clear();
  }

  private async connect(epoch: number): Promise<void> {
    try {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- DOM declarations assume location exists, but server-side runtimes do not provide it.
      const base = new URL(this.options.url, globalThis.location?.href);
      base.pathname = `${base.pathname.replace(/\/$/u, "")}/ws`;
      if (base.protocol === "https:") base.protocol = "wss:";
      else if (base.protocol === "http:") base.protocol = "ws:";
      else if (base.protocol !== "ws:" && base.protocol !== "wss:")
        throw new TypeError("Channel URLs must use HTTP or WebSocket protocols.");
      base.searchParams.set("ch", this.options.key);
      const params = encodeInput(this.options.params);
      if (params !== undefined) base.searchParams.set("params", params);
      const token = await this.options.token?.();
      if (token !== undefined) base.searchParams.set("token", token);
      if (epoch !== this.epoch || this.stopped) return;
      const socket = this.options.createSocket?.(base.href) ?? new WebSocket(base.href);
      this.socket = socket;
      socket.addEventListener("open", () => {
        if (this.socket !== socket) return;
        const hello: ClientFrame =
          this.cursor === undefined
            ? { t: "hello", v: 1 }
            : { t: "hello", v: 1, since: this.cursor };
        this.write(hello);
      });
      socket.addEventListener("message", (event) => {
        if (this.socket !== socket) return;
        if (!textMessage(event)) {
          this.fail(new CableError("PARSE_ERROR"));
          return;
        }
        try {
          this.receive(decodeHostFrame(event.data));
        } catch (cause) {
          this.fail(cause instanceof Error ? cause : new CableError("PARSE_ERROR"));
        }
      });
      socket.addEventListener("close", () => {
        if (this.socket === socket) this.disconnected();
      });
      socket.addEventListener("error", () => {
        if (this.socket === socket) this.fail(new CableError("UNAVAILABLE"));
      });
    } catch (cause) {
      if (epoch !== this.epoch || this.stopped) return;
      this.fail(cause instanceof Error ? cause : new CableError("UNAVAILABLE"));
    }
  }

  private receive(frame: HostFrame | "pong"): void {
    this.lastActivity = Date.now();
    if (frame === "pong") {
      this.awaitingPong = false;
      return;
    }
    if (frame.t === "welcome") {
      this.welcome(frame);
      return;
    }
    if (frame.t === "bye") {
      this.stopped = frame.retry === undefined;
      this.retryDelay = frame.retry;
      this.socket?.close(frame.code, frame.reason);
      this.disconnected();
      return;
    }
    if (this.currentStatus !== "open")
      throw new CableError("PARSE_ERROR", { message: "Expected welcome before live frames." });
    if (frame.t === "err") {
      this.reportError(new CableError(frame.code, frame));
      return;
    }
    if (frame.t === "res") {
      const pending = this.pending.get(frame.id);
      if (pending === undefined) return;
      this.pending.delete(frame.id);
      clearTimeout(pending.timer);
      if (frame.ok) pending.resolve(frame.d);
      else pending.reject(new CableError(frame.e.code, frame.e));
      return;
    }
    if (frame.t === "ev") {
      if (this.cursor !== undefined && frame.seq <= this.cursor) return;
      this.saveCursor(frame.seq);
    }
    this.notify(frame);
  }

  private validateWelcome(frame: Extract<HostFrame, { t: "welcome" }>): void {
    if (this.currentStatus === "open") throw new CableError("PARSE_ERROR");
    if (this.replayHead !== undefined && this.replayHead !== frame.seq)
      throw new CableError("PARSE_ERROR");
    if (this.connectionId !== undefined && this.connectionId !== frame.cid)
      throw new CableError("PARSE_ERROR");
    if (this.cursor !== undefined && frame.seq < this.cursor && frame.reset !== true)
      throw new CableError("PARSE_ERROR");
    if (this.replayReset !== undefined && this.replayReset !== (frame.reset === true))
      throw new CableError("PARSE_ERROR");
    this.replayReset = frame.reset === true;
    this.connectionId = frame.cid;
    this.replayHead = frame.seq;
  }

  private welcome(frame: Extract<HostFrame, { t: "welcome" }>): void {
    this.validateWelcome(frame);
    for (const event of frame.replay) {
      if (event.seq > frame.seq) throw new CableError("PARSE_ERROR");
      if (this.cursor !== undefined && event.seq <= this.cursor) continue;
      this.saveCursor(event.seq);
      this.notify(event);
    }
    this.notify(frame);
    if (frame.more === true || this.stopped || this.socket === undefined) return;
    this.finishWelcome(frame.seq);
  }

  private finishWelcome(seq: number): void {
    this.saveCursor(seq);
    this.replayHead = undefined;
    this.replayReset = undefined;
    this.attempt = 0;
    clearTimeout(this.handshakeTimer);
    this.handshakeTimer = undefined;
    this.setStatus("open");
    if (this.stopped || this.socket === undefined) return;
    for (const pending of this.pending.values()) {
      if (!pending.sent) {
        pending.sent = true;
        if (!this.write(pending.frame)) return;
      }
    }
    for (const queued of this.queued.splice(0)) {
      if (!this.write(queued)) return;
    }
    this.pingTimer = setInterval(() => {
      this.ping();
    }, 25_000);
  }

  private disconnected(): void {
    this.socket = undefined;
    this.replayHead = undefined;
    this.replayReset = undefined;
    this.connectionId = undefined;
    this.clearConnectionTimers();
    this.rejectPending(new CableError("UNAVAILABLE"));
    this.setStatus("closed");
    if (this.stopped || this.retryTimer !== undefined || this.currentStatus !== "closed") return;
    const base = this.options.reconnect?.base ?? 500;
    const max = this.options.reconnect?.max ?? 30_000;
    const backoff = Math.min(max, base * 2 ** Math.min(this.attempt++, 30));
    const delay =
      this.retryDelay ??
      (this.options.reconnect?.jitter === false ? backoff : backoff * (0.5 + Math.random() * 0.5));
    this.retryDelay = undefined;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.start();
    }, delay);
  }

  private ping(): void {
    if (this.awaitingPong) {
      this.fail(new CableError("TIMEOUT"));
      return;
    }
    if (Date.now() - this.lastActivity < 25_000) return;
    this.awaitingPong = true;
    try {
      this.socket?.send("ping");
    } catch (cause) {
      this.fail(cause instanceof Error ? cause : new CableError("UNAVAILABLE"));
    }
  }

  private write(frame: ClientFrame): boolean {
    if (this.socket === undefined) return false;
    try {
      this.socket.send(encodeClientFrame(frame));
      return true;
    } catch (cause) {
      this.fail(cause instanceof Error ? cause : new CableError("UNAVAILABLE"));
      return false;
    }
  }

  private fail(error: Error): void {
    this.epoch += 1;
    this.reportError(error);
    const socket = this.socket;
    this.socket = undefined;
    socket?.close(4000, "Connection failed");
    this.disconnected();
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.queued.length = 0;
  }

  private clearConnectionTimers(): void {
    clearTimeout(this.handshakeTimer);
    clearInterval(this.pingTimer);
    this.handshakeTimer = undefined;
    this.pingTimer = undefined;
    this.awaitingPong = false;
  }

  private setStatus(status: ChannelStatus): void {
    this.currentStatus = status;
    for (const listener of this.statuses) {
      try {
        listener();
      } catch (cause) {
        this.reportError(cause instanceof Error ? cause : new Error("Status observer failed"));
      }
    }
  }

  private notify(frame: HostFrame): void {
    for (const listener of this.frames) {
      try {
        listener(frame);
      } catch (cause) {
        this.reportError(cause instanceof Error ? cause : new Error("Event observer failed"));
      }
    }
  }

  reportError(error: Error): void {
    for (const listener of this.errors) {
      try {
        listener(error);
      } catch {
        /* Error observers cannot break transport state. */
      }
    }
  }

  private cursorKey(): string {
    return `cable:${this.options.url}:${this.options.key}`;
  }

  private saveCursor(seq: number): void {
    this.cursor = seq;
    try {
      this.options.cursors?.setItem(this.cursorKey(), String(seq));
    } catch (cause) {
      this.reportError(cause instanceof Error ? cause : new Error("Cursor storage failed"));
    }
  }
}

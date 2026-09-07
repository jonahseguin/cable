import type { AnyChannelContract } from "@cablejs/contract";
import { CableError, decodeResult, encodeInput, resolveChannel } from "@cablejs/core";
import type { HostFrame, PresenceEntry, RpcCall, RpcResult } from "@cablejs/core";

import type { SocketOptions, Unsubscribe } from "./channel-types.js";
import { ChannelView } from "./channel-view.js";
import { httpError } from "./http-error.js";
import type { LinkContext } from "./link.js";
import { SocketSession } from "./socket-session.js";

/** The presence state shared by all local views of one connection. */
export class ManagedChannel {
  readonly session: SocketSession;
  readonly key: string;
  readonly rawParams: RpcCall["input"];
  references = 0;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();
  private members = new Map<string, PresenceEntry>();
  private readonly pendingMembers = new Map<string, PresenceEntry>();
  private connectionId: string | undefined;
  private desiredPresence: { readonly d: RpcCall["input"] } | undefined;
  private otherMembers: readonly PresenceEntry[] = [];

  constructor(session: SocketSession, key: string, rawParams: RpcCall["input"]) {
    this.session = session;
    this.key = key;
    this.rawParams = rawParams;
    session.onFrame((frame) => {
      this.receive(frame);
    });
    session.onStatus(() => {
      if (session.status === "closed") this.pendingMembers.clear();
    });
  }

  get self(): RpcCall["input"] {
    return this.connectionId === undefined ? undefined : this.members.get(this.connectionId)?.d;
  }
  get others(): readonly PresenceEntry[] {
    return this.otherMembers;
  }

  onPresence(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  updatePresence(data: RpcCall["input"]): Promise<void> {
    this.desiredPresence = { d: data };
    return this.session.send({ t: "presence", d: data });
  }

  private receive(frame: HostFrame): void {
    if (frame.t === "welcome") {
      this.snapshot(frame);
      return;
    }
    if (frame.t !== "presence") return;
    for (const member of frame.join ?? []) this.members.set(member.cid, member);
    for (const member of frame.update ?? []) this.members.set(member.cid, member);
    for (const cid of frame.leave ?? []) this.members.delete(cid);
    this.changed();
  }

  private snapshot(frame: Extract<HostFrame, { t: "welcome" }>): void {
    for (const member of frame.presence) this.pendingMembers.set(member.cid, member);
    if (frame.more === true) return;
    this.connectionId = frame.cid;
    this.members = new Map(this.pendingMembers);
    this.pendingMembers.clear();
    this.changed();
    if (this.desiredPresence !== undefined)
      void this.session.send({ t: "presence", d: this.desiredPresence.d }).catch(() => undefined);
  }

  private changed(): void {
    this.otherMembers = [...this.members.values()].filter(
      (member) => member.cid !== this.connectionId,
    );
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (cause) {
        this.session.reportError(
          cause instanceof Error ? cause : new Error("Presence observer failed"),
        );
      }
    }
  }
}

/** Owns socket sharing and delayed disposal for one cable client. */
export class ChannelPool {
  private readonly context: LinkContext;
  private readonly options: SocketOptions;
  private readonly token: () => string | undefined | Promise<string | undefined>;
  private readonly channels = new Map<string, ManagedChannel>();

  constructor(
    context: LinkContext,
    options: SocketOptions,
    token: () => string | undefined | Promise<string | undefined> = () => undefined,
  ) {
    this.context = context;
    this.options = options;
    this.token = token;
    for (const value of [
      options.idleClose,
      options.requestTimeout,
      options.handshakeTimeout,
      options.reconnect?.base,
      options.reconnect?.max,
    ]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0))
        throw new RangeError("Socket delays must be nonnegative and finite.");
    }
  }

  open(channel: AnyChannelContract, input: RpcCall["input"]): ChannelView {
    return new ChannelView(this, channel, input).proxy();
  }

  async acquire(channel: AnyChannelContract, input: RpcCall["input"]): Promise<ManagedChannel> {
    const encoded = encodeInput(input);
    const raw: RpcCall["input"] = encoded === undefined ? undefined : JSON.parse(encoded);
    const { key } = await resolveChannel(channel, raw);
    let managed = this.channels.get(key);
    if (managed === undefined) {
      const session = new SocketSession({
        ...this.options,
        key,
        params: raw,
        url: this.context.url,
        token: this.token,
      });
      managed = new ManagedChannel(session, key, raw);
      this.channels.set(key, managed);
    }
    clearTimeout(managed.idleTimer);
    managed.idleTimer = undefined;
    managed.references += 1;
    return managed;
  }

  release(managed: ManagedChannel): void {
    managed.references -= 1;
    if (managed.references !== 0) return;
    const close = (): void => {
      managed.session.dispose();
      this.channels.delete(managed.key);
    };
    if (managed.session.status === "closed") close();
    else managed.idleTimer = setTimeout(close, this.options.idleClose ?? 30_000);
  }

  async call(
    managed: ManagedChannel,
    procedure: string,
    input: RpcCall["input"],
  ): Promise<RpcCall["input"]> {
    if (managed.session.status === "open")
      return managed.session.request({ t: "call", p: procedure, d: input });
    const headers = await this.context.headers();
    headers.set("content-type", "application/json");
    try {
      const body = encodeInput({ params: managed.rawParams, input });
      if (body === undefined) throw new Error("A host call envelope must encode as a JSON object.");
      const response = await this.context.fetch(
        `${this.context.url.replace(/\/$/u, "")}/host/${encodeURIComponent(managed.key)}/${encodeURIComponent(procedure)}`,
        {
          method: "POST",
          headers,
          body,
        },
      );
      const result = await hostResult(response);
      if (result.id !== "host")
        throw new CableError("PARSE_ERROR", { message: "Unexpected host procedure result ID." });
      if (!result.ok) throw new CableError(result.error.code, result.error);
      if (!response.ok) throw httpError(response.status);
      return result.data;
    } catch (cause) {
      throw cause instanceof CableError ? cause : new CableError("UNAVAILABLE", { cause });
    }
  }
}

async function hostResult(response: Response): Promise<RpcResult> {
  const text = await response.text();
  try {
    return decodeResult(text);
  } catch (cause) {
    if (!response.ok) throw httpError(response.status);
    throw cause;
  }
}

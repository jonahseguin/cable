/* oxlint-disable anti-slop/no-object-parameters, anti-slop/no-runtime-typeof,
anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- This engine
dispatches dynamic contract members and parses host peer/storage boundaries
before values enter application handlers. */
import {
  isChannelContract,
  type AnyChannelContract,
  type AnyProcedureContract,
  type ErrorMap,
  type InferSchemaInput,
} from "@cablejs/contract";

import { channelKey, parseChannelKey } from "../channel-key.js";
import {
  DEFAULT_REPLAY_CHUNK_BYTES,
  decodeClientFrame,
  encodeHostFrame,
  type CallFrame,
  type ChannelWireError,
  type EmitFrame,
  type EventFrame,
  type HelloFrame,
  type HostFrame,
  type PresenceEntry,
  type PresenceFrame,
  type ResultFrame,
  type WelcomeFrame,
} from "../channel-protocol.js";
import { CableError, isCableError } from "../errors.js";
import { verifyGrant, type VerifiedGrantClaims } from "../grant.js";
import type {
  Attachment,
  Connection,
  ConnectionId,
  GrantId,
  GrantRecord,
  Host,
  HostHandlers,
  PeerMessage,
  UpgradeResult,
} from "../host.js";
import type { RpcCall } from "../rpc.js";
import { assertJsonData } from "../rpc.js";
import { validate } from "../validation.js";
import { DeliveryMutex } from "./delivery-mutex.js";
import { channelError } from "./errors.js";
import {
  ENGINE_KEYS,
  ENGINE_PREFIXES,
  UserStorage,
  eventKey,
  grantKey,
  presenceKey,
  sequenceFromEventKey,
  type StoredEvent,
  type StoredPresence,
} from "./storage.js";
import {
  compactEvents,
  removeTimer,
  runTimers,
  scheduleTimer,
  scheduleTimerIfEarlier,
  type TimerRuntime,
} from "./timer-runtime.js";
import type {
  ChannelAuthorizeContext,
  ChannelConnectionContext,
  ChannelContext,
  ChannelDisconnectContext,
  ChannelImplementation,
  ChannelParams,
  ChannelProcedureContext,
  ChannelTimerContext,
  EmitToOptions,
  EngineOptions,
  EventTarget,
  HistoryLoadInput,
  HistoryPage,
  PeerCallResult,
  TimerPayloads,
} from "./types.js";

const CLOSE_PROTOCOL = 4000;
const CLOSE_UNAUTHORIZED = 4001;
const CLOSE_BACKPRESSURE = 4008;
const CLOSE_PAYLOAD_TOO_LARGE = 4013;
const DEFAULT_BACKPRESSURE_BYTES = 1_048_576;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;
const DEFAULT_PRESENCE_SWEEP_MS = 60_000;
const DEFAULT_RESUME_MAX_EVENTS = 1_000;
const DEFAULT_RESUME_RETAIN_MS = 300_000;
const DEFAULT_TIMER_RETRY_MS = 1_000;
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
// SAFETY: This empty sentinel is used only when a host has no accepted sockets;
// it never crosses the wire or enters storage as a connection identifier.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The opaque type prevents accidental use as an application string.
const EMPTY_CONNECTION_ID = "" as ConnectionId;

interface EnginePolicy {
  readonly backpressureBytes: number;
  readonly handshakeTimeoutMs: number;
  readonly presenceSweepMs: number;
  readonly randomId: () => string;
  readonly replayChunkBytes: number;
  readonly resumeMaxEvents: number;
  readonly resumeRetainMs: number;
  readonly timerRetryMs: number;
}

interface RuntimeClientEvent {
  readonly errors: ErrorMap;
  readonly handler: (
    context: ChannelConnectionContext<AnyChannelContract, object, object>,
    input: RpcCall["input"],
  ) => Promise<void> | void;
  readonly input: AnyProcedureContract["input"];
}

interface RuntimeProcedure {
  readonly contract: AnyProcedureContract;
  readonly handler: (
    context: ChannelProcedureContext<AnyChannelContract, object, object>,
    input: RpcCall["input"],
  ) => RpcCall["input"];
}

interface RuntimeTimer {
  readonly handler: (
    context: ChannelTimerContext<AnyChannelContract, object>,
    args: RpcCall["input"],
  ) => Promise<void> | void;
}

type ConnectionRecord<TChannel extends AnyChannelContract, TIdentity> = GrantRecord<
  TIdentity,
  ChannelParams<TChannel>
>;

/** Create hibernation-safe handlers for one channel host instance. */
export function createEngine<
  TChannel extends AnyChannelContract,
  TIdentity = unknown,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
>(
  channel: TChannel,
  implementation: ChannelImplementation<TChannel, TIdentity, TTimerPayloads>,
  host: Host,
  options: EngineOptions,
): HostHandlers {
  return new ChannelEngine(channel, implementation, host, options).handlers();
}

class ChannelEngine<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads,
> implements TimerRuntime {
  private readonly clientEvents = new Map<string, RuntimeClientEvent>();
  private readonly delivery = new DeliveryMutex();
  private readonly params: ChannelParams<TChannel>;
  private readonly policy: EnginePolicy;
  private readonly procedures = new Map<string, RuntimeProcedure>();
  private readonly timers = new Map<string, RuntimeTimer>();
  private readonly channel: TChannel;
  private readonly host: Host;
  private readonly implementation: ChannelImplementation<TChannel, TIdentity, TTimerPayloads>;
  private readonly options: EngineOptions;

  public constructor(
    channel: TChannel,
    implementation: ChannelImplementation<TChannel, TIdentity, TTimerPayloads>,
    host: Host,
    options: EngineOptions,
  ) {
    if (!isChannelContract(channel)) {
      throw new TypeError("channel must be a contract returned by c.channel");
    }
    this.params = parseChannelKey(channel, host.key);
    this.channel = channel;
    this.host = host;
    this.implementation = implementation;
    this.options = options;
    this.policy = normalizePolicy(host, options);
    this.collectRuntimeHandlers();
  }

  public handlers(): HostHandlers {
    return {
      onAlarm: () => this.onAlarm(),
      onClose: (connection, code, reason, wasClean) =>
        this.onClose(connection, code, reason, wasClean),
      onError: (connection, error) => this.onConnectionError(connection, error),
      onMessage: (connection, data) => this.onMessage(connection, data),
      onPeer: (message) => this.onPeer(message),
      onUpgrade: (request, grant) => this.onUpgrade(request, grant),
    };
  }

  private collectRuntimeHandlers(): void {
    for (const [name, contract] of Object.entries(this.channel.client)) {
      const handler = readHandler(this.implementation.onClient, name);
      if (handler === undefined) {
        throw new TypeError(`Missing client event handler '${name}'`);
      }
      this.clientEvents.set(name, { errors: contract.errors, handler, input: contract.input });
    }
    for (const [name, contract] of Object.entries(this.channel.procedures)) {
      const handler = readProcedure(this.implementation.procedures, name);
      if (handler === undefined) {
        throw new TypeError(`Missing channel procedure handler '${name}'`);
      }
      this.procedures.set(name, { contract, handler });
    }
    for (const name of Object.keys(this.implementation.timers ?? {})) {
      if (name.startsWith("$")) {
        throw new TypeError("Application timer names must not start with '$'");
      }
      const runtimeHandler = readTimer(this.implementation.timers ?? {}, name);
      if (runtimeHandler !== undefined) this.timers.set(name, { handler: runtimeHandler });
    }
  }

  private async onUpgrade(
    request: Request,
    grant: Parameters<HostHandlers["onUpgrade"]>[1],
  ): Promise<UpgradeResult> {
    let reservedGrant: GrantId | undefined;
    try {
      const verified = await verifyGrant(
        grant,
        this.options.grantSecret,
        this.host.key,
        this.host.now(),
      );
      if (channelKey(this.channel, verified.params) !== this.host.key) {
        throw new CableError("UNAUTHORIZED", { message: "Grant parameters do not match host" });
      }
      const claims = connectionRecord<TChannel, TIdentity>(verified);
      const authorizeContext = this.authorizeContext(request, claims);
      await this.implementation.authorize?.(authorizeContext);
      const cid = this.newConnectionId();
      this.assertConnectionIdFits(cid);
      const grantId = grantIdFromConnection(cid);
      const attachment: Attachment = { cid, grantId, phase: "pending", v: 1 };
      assertAttachmentSize(attachment, this.host.limits.attachmentBytes);
      await this.host.storage.transaction(async (storage) => {
        if ((await storage.get(grantKey(grantId))) !== undefined) {
          throw new CableError("CONFLICT", { message: "randomId returned a duplicate value" });
        }
        await storage.put(grantKey(grantId), claims);
      });
      reservedGrant = grantId;
      await this.scheduleHandshake(cid, grantId);
      const tags = claims.uid === undefined ? [`cid:${cid}`] : [`cid:${cid}`, `uid:${claims.uid}`];
      return { accept: true, attachment, tags };
    } catch (error) {
      if (reservedGrant !== undefined) {
        try {
          await this.host.storage.delete(grantKey(reservedGrant));
        } catch (cleanupError) {
          await this.report(cleanupError, "upgrade cleanup");
        }
      }
      await this.report(error, "upgrade");
      return rejectedUpgrade(error);
    }
  }

  private async onMessage(connection: Connection, data: string | ArrayBuffer): Promise<void> {
    const attachment = connection.attachment.get();
    if (attachment === undefined) {
      this.close(connection, CLOSE_PROTOCOL, "Missing connection attachment");
      return;
    }
    let frame: ReturnType<typeof decodeClientFrame>;
    try {
      frame = decodeClientFrame(data, this.host.limits.maxFrameBytes);
    } catch (error) {
      await this.handleFrameError(connection, attachment, error);
      return;
    }
    if (frame === "ping") {
      this.send(connection, "pong");
      return;
    }
    if (frame.t === "hello") {
      await this.handleHello(connection, attachment, frame);
      return;
    }
    if (attachment.phase !== "ready") {
      this.close(connection, CLOSE_PROTOCOL, "hello must be the first frame");
      return;
    }
    const record = await this.loadRecord(connection, attachment);
    if (record === undefined) return;
    switch (frame.t) {
      case "emit":
        await this.handleClientEmit(connection, record, frame);
        return;
      case "call":
        await this.handleCall(connection, record, frame);
        return;
      case "presence":
        await this.handlePresence(connection, record, frame.d);
        return;
    }
  }

  private async handleHello(
    connection: Connection,
    attachment: Attachment,
    frame: HelloFrame,
  ): Promise<void> {
    if (attachment.phase !== "pending") {
      this.close(connection, CLOSE_PROTOCOL, "hello was already received");
      return;
    }
    const record = await this.loadRecord(connection, attachment);
    if (record === undefined) return;
    try {
      await this.delivery.run(async () => {
        const current = connection.attachment.get();
        if (current?.phase !== "pending") {
          throw new CableError("CONFLICT", { message: "Connection handshake already started" });
        }
        connection.attachment.set(withPhase(current, "resuming", frame.since));
        const snapshot = await this.readWelcomeSnapshot(record, current.cid, frame.since);
        for (const welcome of chunkWelcome(
          current.cid,
          snapshot.sequence,
          snapshot.presence,
          snapshot.replay,
          snapshot.reset,
          Math.min(this.policy.replayChunkBytes, this.host.limits.maxFrameBytes),
        )) {
          if (!this.send(connection, welcome)) {
            throw new CableError("UNAVAILABLE", { message: "Connection closed during welcome" });
          }
        }
        connection.attachment.set(withPhase(current, "ready", frame.since));
      });
      await this.removeTimer(`handshake:${attachment.cid}`);
      await this.callHook(
        async () => this.implementation.onConnect?.(this.connectionContext(connection, record)),
        "connect hook",
        connection,
      );
    } catch (error) {
      await this.report(error, "hello", connection);
      this.close(connection, CLOSE_PROTOCOL, "Handshake failed");
    }
  }

  private async handleClientEmit(
    connection: Connection,
    record: ConnectionRecord<TChannel, TIdentity>,
    frame: EmitFrame,
  ): Promise<void> {
    const event = this.clientEvents.get(frame.ev);
    if (event === undefined) {
      this.sendOperationError(connection, frame.id, {
        code: "NOT_FOUND",
        message: "Event not found",
      });
      return;
    }
    try {
      const input = await validate(event.input, frame.d);
      await event.handler(this.erasedConnectionContext(connection, record), input);
      if (frame.id !== undefined) this.send(connection, { id: frame.id, ok: true, t: "res" });
    } catch (error) {
      await this.report(error, `client event ${frame.ev}`, connection);
      this.sendOperationError(connection, frame.id, await channelError(error, event.errors));
    }
  }

  private async handleCall(
    connection: Connection,
    record: ConnectionRecord<TChannel, TIdentity>,
    frame: CallFrame,
  ): Promise<void> {
    const result = await this.executeProcedure(frame.p, frame.d, record, connection);
    this.send(connection, toResultFrame(frame.id, result));
  }

  private async executeProcedure(
    name: string,
    inputValue: RpcCall["input"],
    record: ConnectionRecord<TChannel, TIdentity>,
    connection?: Connection,
  ): Promise<ProcedureResult> {
    if (name === "history.load") {
      return this.executeHistory(inputValue, record, connection);
    }
    const procedure = this.procedures.get(name);
    if (procedure === undefined) {
      return { error: { code: "NOT_FOUND", message: "Procedure not found" }, ok: false };
    }
    try {
      const input = await validate(procedure.contract.input, inputValue);
      const output = await procedure.handler(
        this.erasedProcedureContext(record, connection),
        input,
      );
      const data = await validate(procedure.contract.output, output);
      assertJsonData(data, "INTERNAL");
      return { data, ok: true };
    } catch (error) {
      await this.report(error, `channel procedure ${name}`, connection);
      return { error: await channelError(error, procedure.contract.errors), ok: false };
    }
  }

  private async executeHistory(
    input: RpcCall["input"],
    record: ConnectionRecord<TChannel, TIdentity>,
    connection?: Connection,
  ): Promise<ProcedureResult> {
    if (this.channel.history === undefined) {
      return { error: { code: "NOT_FOUND", message: "History is not enabled" }, ok: false };
    }
    try {
      const query = parseHistoryInput(input);
      const data = await this.loadHistory(query, record, connection?.attachment.get()?.cid);
      return { data, ok: true };
    } catch (error) {
      return { error: await channelError(error, {}), ok: false };
    }
  }

  private async handlePresence(
    connection: Connection,
    record: ConnectionRecord<TChannel, TIdentity>,
    value: RpcCall["input"],
  ): Promise<void> {
    if (this.channel.presence === undefined) {
      this.send(connection, { code: "NOT_FOUND", message: "Presence is not enabled", t: "err" });
      return;
    }
    try {
      const data = await validate(this.channel.presence, value);
      assertJsonData(data, "BAD_REQUEST");
      const attachment = connection.attachment.get();
      if (attachment === undefined) {
        this.close(connection, CLOSE_PROTOCOL, "Missing connection attachment");
        return;
      }
      await this.delivery.run(async () => {
        const key = presenceKey(attachment.cid);
        const stored = presenceRecord(attachment.cid, record.uid, data, this.host.now());
        const entry = presenceEntry(stored);
        const frame = await this.host.storage.transaction(async (storage) => {
          const previous = await storage.get<StoredPresence>(key);
          const sequence = (await storage.get<number>(ENGINE_KEYS.sequence)) ?? 0;
          const presenceFrame: PresenceFrame =
            previous === undefined
              ? { join: [entry], t: "presence" }
              : { t: "presence", update: [entry] };
          this.assertPresenceFits(presenceFrame, entry, sequence);
          await storage.put(key, stored);
          return presenceFrame;
        });
        this.broadcast(frame);
      });
      await this.ensurePresenceSweep();
    } catch (error) {
      await this.report(error, "presence", connection);
      const wire = await channelError(error, {});
      this.send(connection, protocolErrorFrame(wire));
    }
  }

  private async onClose(
    connection: Connection,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    const attachment = connection.attachment.get();
    if (attachment === undefined) return;
    const record = await this.host.storage.get<ConnectionRecord<TChannel, TIdentity>>(
      grantKey(attachment.grantId),
    );
    await this.delivery.run(async () => {
      const presence = await this.host.storage.get<StoredPresence>(presenceKey(attachment.cid));
      await this.host.storage.delete([presenceKey(attachment.cid), grantKey(attachment.grantId)]);
      if (presence !== undefined) {
        this.broadcast({ leave: [attachment.cid], t: "presence" });
      }
    });
    await this.removeTimer(`handshake:${attachment.cid}`);
    if (record !== undefined) {
      const context: ChannelDisconnectContext<TChannel, TIdentity, TTimerPayloads> = {
        ...this.connectionContext(connection, record),
        code,
        reason,
        wasClean,
      };
      await this.callHook(
        async () => this.implementation.onDisconnect?.(context),
        "disconnect hook",
        connection,
      );
    }
  }

  private async onConnectionError(connection: Connection, error: unknown): Promise<void> {
    await this.report(error, "connection", connection);
  }

  private async onPeer(message: PeerMessage): Promise<unknown> {
    switch (message.t) {
      case "ping":
        return { t: "pong" };
      case "emit":
        return this.peerEmit(message);
      case "call":
        return this.peerCall(message);
      default:
        throw new CableError("PARSE_ERROR", { message: "Unknown peer message" });
    }
  }

  private async peerEmit(message: PeerMessage): Promise<{ readonly seq: number }> {
    const event = requirePeerString(message, "ev");
    const seq = await this.emitNamed(event, message["d"]);
    return { seq };
  }

  private async peerCall(message: PeerMessage): Promise<PeerCallResult<RpcCall["input"]>> {
    const name = requirePeerString(message, "p");
    const identity = message["identity"];
    const grants = requirePeerStrings(message, "grants");
    const uid = optionalPeerString(message, "uid");
    // SAFETY: Peers are an internal adapter boundary. The adapter supplies the
    // same TIdentity used to configure this engine; grants and uid are parsed here.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The trusted peer seam owns identity serialization.
    const typedIdentity = identity as TIdentity;
    const record: ConnectionRecord<TChannel, TIdentity> = {
      exp: Number.MAX_SAFE_INTEGER,
      grants,
      hostKey: this.host.key,
      identity: typedIdentity,
      params: this.params,
      v: 1,
    };
    let result: ProcedureResult;
    if (uid !== undefined) {
      result = await this.executeProcedure(name, message["d"], { ...record, uid });
    } else {
      result = await this.executeProcedure(name, message["d"], record);
    }
    return result.ok ? { d: result.data, ok: true } : { e: result.error, ok: false };
  }

  private authorizeContext(
    request: Request,
    record: ConnectionRecord<TChannel, TIdentity>,
  ): ChannelAuthorizeContext<TChannel, TIdentity> {
    const context: ChannelAuthorizeContext<TChannel, TIdentity> = {
      grants: record.grants,
      hostKey: this.host.key,
      identity: record.identity,
      params: record.params,
      request,
    };
    return record.uid === undefined ? context : { ...context, uid: record.uid };
  }

  private connectionContext(
    connection: Connection,
    record: ConnectionRecord<TChannel, TIdentity>,
  ): ChannelConnectionContext<TChannel, TIdentity, TTimerPayloads> {
    return {
      ...this.baseContext(record.params),
      connection,
      grants: record.grants,
      identity: record.identity,
    };
  }

  private procedureContext(
    record: ConnectionRecord<TChannel, TIdentity>,
    connection?: Connection,
  ): ChannelProcedureContext<TChannel, TIdentity, TTimerPayloads> {
    const base = {
      ...this.baseContext(record.params),
      grants: record.grants,
      identity: record.identity,
    };
    return connection === undefined ? base : { ...base, connection };
  }

  private baseContext(params: ChannelParams<TChannel>): ChannelContext<TChannel, TTimerPayloads> {
    return {
      connections: (tag) => this.host.connections(tag),
      emit: (event, data) => this.emit(event, data),
      emitTo: (target, event, data, options) => this.emitTo(target, event, data, options),
      hostKey: this.host.key,
      now: () => this.host.now(),
      params,
      peers: this.host.peers,
      schedule: (kind, at, args) => this.scheduleUserTimer(kind, at, args),
      storage: new UserStorage(this.host.storage),
    };
  }

  private erasedConnectionContext(
    connection: Connection,
    record: ConnectionRecord<TChannel, TIdentity>,
  ): ChannelConnectionContext<AnyChannelContract, object, object> {
    // SAFETY: RuntimeClientEvent was erased from this exact channel and identity
    // configuration; the paired contract schema already parsed its input.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Dynamic event-name dispatch requires erasing the mapped handler context.
    return this.connectionContext(connection, record) as ChannelConnectionContext<
      AnyChannelContract,
      object,
      object
    >;
  }

  private erasedProcedureContext(
    record: ConnectionRecord<TChannel, TIdentity>,
    connection?: Connection,
  ): ChannelProcedureContext<AnyChannelContract, object, object> {
    // SAFETY: RuntimeProcedure was erased from this exact channel and identity
    // configuration; the paired procedure contract parses input and output.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Dynamic procedure-name dispatch requires erasing the mapped handler context.
    return this.procedureContext(record, connection) as ChannelProcedureContext<
      AnyChannelContract,
      object,
      object
    >;
  }

  private async emit<TName extends keyof TChannel["server"] & string>(
    event: TName,
    input: InferSchemaInput<TChannel["server"][TName]>,
  ): Promise<number> {
    return this.emitNamed(event, input);
  }

  private async emitNamed(event: string, input: RpcCall["input"]): Promise<number> {
    const data = await this.validateServerEvent(event, input);
    return this.delivery.run(async () => {
      const frame = await this.appendEvent(event, data);
      this.broadcast(frame);
      return frame.seq;
    });
  }

  private async emitTo<TName extends keyof TChannel["server"] & string>(
    target: EventTarget,
    event: TName,
    input: InferSchemaInput<TChannel["server"][TName]>,
    options?: EmitToOptions,
  ): Promise<void> {
    const data = await this.validateServerEvent(event, input);
    await this.delivery.run(async () => {
      const selector = eventTarget(target);
      if (options?.log === true) {
        const frame = await this.appendEvent(event, data, selector);
        this.broadcast(frame, selector);
        return;
      }
      this.broadcast({ d: data, ev: event, t: "evt" }, selector);
    });
  }

  private async validateServerEvent(
    event: string,
    input: RpcCall["input"],
  ): Promise<RpcCall["input"]> {
    const schema = this.channel.server[event];
    if (schema === undefined) {
      throw new CableError("NOT_FOUND", { message: `Server event '${event}' is not declared` });
    }
    const data = await validate(schema, input);
    assertJsonData(data, "INTERNAL");
    return data;
  }

  private async appendEvent(
    event: string,
    data: RpcCall["input"],
    target?: StoredEvent["target"],
  ): Promise<EventFrame> {
    const at = this.host.now();
    const frame = await this.host.storage.transaction(async (storage) => {
      const current = (await storage.get<number>(ENGINE_KEYS.sequence)) ?? 0;
      const sequence = current + 1;
      if (!Number.isSafeInteger(sequence)) {
        throw new CableError("INTERNAL", { message: "Channel sequence is exhausted" });
      }
      const stored: StoredEvent =
        target === undefined ? { at, d: data, ev: event } : { at, d: data, ev: event, target };
      const oldest = await storage.get<number>(ENGINE_KEYS.oldest);
      const eventFrame = { d: data, ev: event, seq: sequence, t: "ev" } as const;
      this.assertEventFits(eventFrame);
      await storage.putMany({
        [ENGINE_KEYS.oldest]: oldest ?? sequence,
        [ENGINE_KEYS.sequence]: sequence,
        [eventKey(sequence)]: stored,
      });
      return eventFrame;
    });
    await this.ensureCompaction(frame.seq, at);
    return frame;
  }

  private broadcast(frame: HostFrame | "pong", target?: StoredEvent["target"]): void {
    const encoded = encodeHostFrame(frame, this.host.limits.maxFrameBytes);
    const bytes = encodedBytes(encoded);
    for (const connection of this.host.connections()) {
      const attachment = connection.attachment.get();
      if (attachment?.phase !== "ready" || !matchesTarget(connection, target)) continue;
      this.sendEncoded(connection, encoded, bytes);
    }
  }

  private send(connection: Connection, frame: HostFrame | "pong"): boolean {
    const encoded = encodeHostFrame(frame, this.host.limits.maxFrameBytes);
    return this.sendEncoded(connection, encoded, encodedBytes(encoded));
  }

  private sendEncoded(connection: Connection, encoded: string, bytes: number): boolean {
    const buffered = connection.bufferedAmount;
    if (buffered !== undefined && buffered + bytes > this.policy.backpressureBytes) {
      this.close(connection, CLOSE_BACKPRESSURE, "Connection is too far behind", 1_000);
      return false;
    }
    try {
      connection.send(encoded);
      return true;
    } catch (error) {
      this.host.waitUntil(this.report(error, "connection send", connection));
      this.close(connection, CLOSE_BACKPRESSURE, "Connection send failed", 1_000);
      return false;
    }
  }

  private close(connection: Connection, code: number, reason: string, retry?: number): void {
    try {
      connection.send(
        encodeHostFrame(
          retry === undefined ? { code, reason, t: "bye" } : { code, reason, retry, t: "bye" },
          this.host.limits.maxFrameBytes,
        ),
      );
    } catch (error) {
      this.host.waitUntil(this.report(error, "connection close advisory", connection));
    }
    try {
      connection.close(code, reason);
    } catch (error) {
      this.host.waitUntil(this.report(error, "connection close", connection));
    }
  }

  private assertConnectionIdFits(cid: ConnectionId): void {
    chunkWelcome(cid, 0, [], [], undefined, this.welcomeFrameBytes());
    encodeHostFrame({ leave: [cid], t: "presence" }, this.host.limits.maxFrameBytes);
  }

  private assertEventFits(frame: EventFrame): void {
    encodeHostFrame(frame, this.host.limits.maxFrameBytes);
    assertWelcomeFrameFits(
      welcomeFrame(this.replaySizingConnectionId(), frame.seq, [], [frame], true, true),
      this.welcomeFrameBytes(),
    );
  }

  private assertPresenceFits(frame: PresenceFrame, entry: PresenceEntry, sequence: number): void {
    encodeHostFrame(frame, this.host.limits.maxFrameBytes);
    assertWelcomeFrameFits(
      welcomeFrame(this.replaySizingConnectionId(), sequence, [entry], [], true, true),
      this.welcomeFrameBytes(),
    );
  }

  private replaySizingConnectionId(): ConnectionId {
    let selected = EMPTY_CONNECTION_ID;
    let selectedBytes = 0;
    for (const connection of this.host.connections()) {
      const cid = connection.attachment.get()?.cid;
      if (cid === undefined) continue;
      const bytes = encodedBytes(JSON.stringify(cid));
      if (bytes > selectedBytes) {
        selected = cid;
        selectedBytes = bytes;
      }
    }
    return selected;
  }

  private welcomeFrameBytes(): number {
    return Math.min(this.policy.replayChunkBytes, this.host.limits.maxFrameBytes);
  }

  private newConnectionId(): ConnectionId {
    const value = requireGeneratedId(this.policy.randomId());
    // SAFETY: ConnectionId is an opaque non-empty generated string.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The generator result was validated immediately above.
    return value as ConnectionId;
  }

  private async loadRecord(
    connection: Connection,
    attachment: Attachment,
  ): Promise<ConnectionRecord<TChannel, TIdentity> | undefined> {
    const record = await this.host.storage.get<ConnectionRecord<TChannel, TIdentity>>(
      grantKey(attachment.grantId),
    );
    if (record === undefined) {
      this.close(connection, CLOSE_UNAUTHORIZED, "Connection grant is missing");
      return undefined;
    }
    return record;
  }

  private async readWelcomeSnapshot(
    record: ConnectionRecord<TChannel, TIdentity>,
    cid: ConnectionId,
    since: number | undefined,
  ): Promise<WelcomeSnapshot> {
    return this.host.storage.transaction(async (storage) => {
      const sequence = (await storage.get<number>(ENGINE_KEYS.sequence)) ?? 0;
      const oldest = (await storage.get<number>(ENGINE_KEYS.oldest)) ?? sequence + 1;
      const presence = orderPresence([
        ...(await storage.list<StoredPresence>({ prefix: ENGINE_PREFIXES.presence })).values(),
      ]);
      if (since === undefined) return { presence, replay: [], sequence };
      if (since < oldest - 1 || since > sequence) {
        return { presence, replay: [], reset: true, sequence };
      }
      const records = await storage.list<StoredEvent>({
        end: eventKey(sequence + 1),
        prefix: ENGINE_PREFIXES.event,
        start: eventKey(since + 1),
      });
      const replay: EventFrame[] = [];
      for (const [key, event] of records) {
        if (matchesRecord(record, cid, event.target)) {
          replay.push({ d: event.d, ev: event.ev, seq: sequenceFromEventKey(key), t: "ev" });
        }
      }
      return { presence, replay, sequence };
    });
  }

  private async loadHistory(
    input: HistoryLoadInput,
    record: ConnectionRecord<TChannel, TIdentity>,
    cid: ConnectionId | undefined,
  ): Promise<HistoryPage<TChannel>> {
    const head = (await this.host.storage.get<number>(ENGINE_KEYS.sequence)) ?? 0;
    const before = input.before ?? head + 1;
    const limit = input.limit ?? DEFAULT_HISTORY_LIMIT;
    const records = await this.host.storage.list<StoredEvent>({
      end: eventKey(Math.min(before, head + 1)),
      prefix: ENGINE_PREFIXES.event,
      reverse: true,
    });
    const visible = [...records].filter(([, event]) => matchesRecord(record, cid, event.target));
    const rows = visible.slice(0, limit);
    rows.reverse();
    // SAFETY: Every StoredEvent was validated against this channel's named
    // server-event schema before append; history only adds durable metadata.
    const events = rows.map(([key, event]) => ({
      at: event.at,
      d: event.d,
      ev: event.ev,
      seq: sequenceFromEventKey(key),
      t: "ev" as const,
    })) as HistoryPage<TChannel>["events"];
    if (visible.length <= limit || rows.length === 0) return { events };
    const first = rows[0];
    return first === undefined
      ? { events }
      : { events, nextCursor: sequenceFromEventKey(first[0]) };
  }

  private async handleFrameError(
    connection: Connection,
    attachment: Attachment,
    error: unknown,
  ): Promise<void> {
    await this.report(error, "frame decode", connection);
    const message = isCableError(error) ? error.message : "Invalid channel frame";
    if (message.includes("maxFrameBytes")) {
      this.close(connection, CLOSE_PAYLOAD_TOO_LARGE, "Frame is too large");
      return;
    }
    if (attachment.phase !== "ready") {
      this.close(connection, CLOSE_PROTOCOL, "Invalid handshake frame");
      return;
    }
    this.send(connection, { code: "PARSE_ERROR", message, t: "err" });
  }

  private sendOperationError(
    connection: Connection,
    id: string | undefined,
    error: ChannelWireError,
  ): void {
    if (id === undefined) {
      this.send(connection, protocolErrorFrame(error));
      return;
    }
    this.send(connection, { e: error, id, ok: false, t: "res" });
  }

  private async callHook(
    hook: () => Promise<unknown>,
    operation: string,
    connection?: Connection,
  ): Promise<void> {
    try {
      await hook();
    } catch (error) {
      await this.report(error, operation, connection);
    }
  }

  private async report(error: unknown, operation: string, connection?: Connection): Promise<void> {
    try {
      const context =
        connection === undefined ? { error, operation } : { connection, error, operation };
      await this.implementation.onError?.(context);
    } catch {
      // Error reporting is observational and cannot change engine state.
    }
  }

  private erasedTimerContext(): ChannelTimerContext<AnyChannelContract, object> {
    return this.baseContext(this.params);
  }

  private scheduleHandshake(cid: ConnectionId, grantId: GrantId): Promise<void> {
    return this.scheduleTimer(
      `handshake:${cid}`,
      "$handshake",
      this.host.now() + this.policy.handshakeTimeoutMs,
      { cid, grantId },
    );
  }

  private ensurePresenceSweep(): Promise<void> {
    return scheduleTimerIfEarlier(
      this.host,
      "presence",
      "$presence",
      this.host.now() + this.policy.presenceSweepMs,
      undefined,
    );
  }

  private async ensureCompaction(sequence: number, at: number): Promise<void> {
    const oldest = (await this.host.storage.get<number>(ENGINE_KEYS.oldest)) ?? sequence;
    const due =
      sequence - oldest + 1 > this.retentionMax() ? this.host.now() : at + this.retentionMs();
    return scheduleTimerIfEarlier(this.host, "compact", "$compact", due, { sequence });
  }

  private async scheduleUserTimer<TKind extends keyof TTimerPayloads & string>(
    kind: TKind,
    at: number,
    args: TTimerPayloads[TKind],
  ): Promise<string> {
    if (!this.timers.has(kind)) {
      throw new CableError("NOT_FOUND", { message: `Timer '${kind}' has no handler` });
    }
    assertJsonData(args, "BAD_REQUEST");
    const id = `user:${requireGeneratedId(this.policy.randomId())}`;
    await this.scheduleTimer(id, `user:${kind}`, at, args);
    return id;
  }

  private retentionMs(): number {
    return this.channel.history === undefined
      ? this.policy.resumeRetainMs
      : parseDuration(this.channel.history.retain);
  }

  private retentionMax(): number {
    return this.channel.history?.max ?? this.policy.resumeMaxEvents;
  }

  private async onAlarm(): Promise<void> {
    await runTimers(this);
  }

  // Timer operations are defined below the channel state machine to keep frame
  // dispatch independent from the single-alarm persistence algorithm.
  public timerHost(): Host {
    return this.host;
  }

  public timerReport(error: unknown, operation: string): Promise<void> {
    return this.report(error, operation);
  }

  public timerCompact(): Promise<number | undefined> {
    return compactEvents(
      this.host.storage,
      this.host.now(),
      this.retentionMs(),
      this.retentionMax(),
    );
  }

  public timerSweepPresence(): Promise<number | undefined> {
    return this.sweepPresence();
  }

  public timerExpireHandshake(args: RpcCall["input"]): Promise<number | undefined> {
    return this.expireHandshake(args);
  }

  public scheduleTimer(
    id: string,
    kind: string,
    at: number,
    args: RpcCall["input"],
  ): Promise<void> {
    return scheduleTimer(this.host, id, kind, at, args);
  }

  public removeTimer(id: string): Promise<void> {
    return removeTimer(this.host, id);
  }

  public timerRetryMs(): number {
    return this.policy.timerRetryMs;
  }

  public async timerExecute(kind: string, args: RpcCall["input"]): Promise<number | undefined> {
    switch (kind) {
      case "$compact":
        return this.timerCompact();
      case "$presence":
        return this.timerSweepPresence();
      case "$handshake":
        return this.timerExpireHandshake(args);
      default: {
        const name = kind.startsWith("user:") ? kind.slice("user:".length) : "";
        const timer = this.timers.get(name);
        if (timer === undefined) {
          throw new CableError("NOT_FOUND", { message: `Timer handler '${name}' is missing` });
        }
        await timer.handler(this.erasedTimerContext(), args);
        return undefined;
      }
    }
  }

  private async sweepPresence(): Promise<number | undefined> {
    const live = new Set<string>();
    for (const connection of this.host.connections()) {
      const attachment = connection.attachment.get();
      if (attachment !== undefined) live.add(attachment.cid);
    }
    const remains = await this.delivery.run(async () => {
      const records = await this.host.storage.list<StoredPresence>({
        prefix: ENGINE_PREFIXES.presence,
      });
      const stale: ConnectionId[] = [];
      const staleKeys: string[] = [];
      for (const [key, presence] of records) {
        if (live.has(presence.cid)) {
          continue;
        }
        stale.push(toConnectionId(presence.cid));
        staleKeys.push(key);
      }
      if (staleKeys.length > 0) await this.host.storage.delete(staleKeys);
      if (stale.length > 0) this.broadcast({ leave: stale, t: "presence" });
      return records.size > staleKeys.length;
    });
    return remains ? this.host.now() + this.policy.presenceSweepMs : undefined;
  }

  private async expireHandshake(args: RpcCall["input"]): Promise<number | undefined> {
    const parsed = parseHandshakeArgs(args);
    const connection = findConnection(this.host, parsed.cid);
    if (connection !== undefined) {
      const attachment = connection.attachment.get();
      if (attachment?.phase === "pending" || attachment?.phase === "resuming") {
        this.close(connection, CLOSE_PROTOCOL, "Handshake timed out");
      } else if (attachment?.phase === "ready") {
        return undefined;
      }
    }
    await this.host.storage.delete(grantKey(parsed.grantId));
    return undefined;
  }
}

interface ProcedureSuccess {
  readonly data: RpcCall["input"];
  readonly ok: true;
}

interface ProcedureFailure {
  readonly error: ChannelWireError;
  readonly ok: false;
}

type ProcedureResult = ProcedureFailure | ProcedureSuccess;

interface WelcomeSnapshot {
  readonly presence: readonly PresenceEntry[];
  readonly replay: readonly EventFrame[];
  readonly reset?: true;
  readonly sequence: number;
}

interface WelcomeItem {
  readonly event?: EventFrame;
  readonly presence?: PresenceEntry;
}

interface WelcomeParts {
  readonly presence: readonly PresenceEntry[];
  readonly replay: readonly EventFrame[];
}

function normalizePolicy(host: Host, options: EngineOptions): EnginePolicy {
  return {
    backpressureBytes: positiveInteger(
      options.backpressureBytes ?? DEFAULT_BACKPRESSURE_BYTES,
      "backpressureBytes",
    ),
    handshakeTimeoutMs: positiveInteger(
      options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
      "handshakeTimeoutMs",
    ),
    presenceSweepMs: positiveInteger(
      options.presenceSweepMs ?? DEFAULT_PRESENCE_SWEEP_MS,
      "presenceSweepMs",
    ),
    randomId: options.randomId ?? (() => crypto.randomUUID()),
    replayChunkBytes: positiveInteger(
      options.replayChunkBytes ?? DEFAULT_REPLAY_CHUNK_BYTES,
      "replayChunkBytes",
      host.limits.maxFrameBytes,
    ),
    resumeMaxEvents: positiveInteger(
      options.resumeMaxEvents ?? DEFAULT_RESUME_MAX_EVENTS,
      "resumeMaxEvents",
    ),
    resumeRetainMs: positiveInteger(
      options.resumeRetainMs ?? DEFAULT_RESUME_RETAIN_MS,
      "resumeRetainMs",
    ),
    timerRetryMs: positiveInteger(options.timerRetryMs ?? DEFAULT_TIMER_RETRY_MS, "timerRetryMs"),
  };
}

function positiveInteger(value: number, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(`${label} must be a positive safe integer no greater than ${maximum}`);
  }
  return value;
}

function requireGeneratedId(value: string): string {
  if (value.length === 0 || new TextEncoder().encode(value).byteLength > 128) {
    throw new TypeError("randomId must return a non-empty string of at most 128 UTF-8 bytes");
  }
  return value;
}

function assertAttachmentSize(attachment: Attachment, maximum: number): void {
  if (new TextEncoder().encode(JSON.stringify(attachment)).byteLength > maximum) {
    throw new CableError("INTERNAL", { message: "Connection attachment exceeds host limit" });
  }
}

function rejectedUpgrade(error: unknown): UpgradeResult {
  let status = 500;
  let message = "Internal server error";
  if (isCableError(error)) {
    status = error.status;
    message = error.code === "INTERNAL" ? message : error.message;
  }
  return {
    accept: false,
    response: new Response(JSON.stringify({ error: { message } }), {
      headers: { "cache-control": "no-store", "content-type": "application/json" },
      status,
    }),
  };
}

function connectionRecord<TChannel extends AnyChannelContract, TIdentity>(
  verified: VerifiedGrantClaims,
): ConnectionRecord<TChannel, TIdentity> {
  // SAFETY: The signed grant was created after the edge resolved this channel's
  // params and identity. verifyGrant parsed its exact string map, and channelKey
  // equality was checked before this evidence is used by the engine.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- HMAC authentication establishes the configured edge-to-engine generic contract.
  return verified as ConnectionRecord<TChannel, TIdentity>;
}

function protocolErrorFrame(error: ChannelWireError): HostFrame {
  return error.message === undefined
    ? { code: error.code, t: "err" }
    : { code: error.code, message: error.message, t: "err" };
}

function withPhase(
  attachment: Attachment,
  phase: Attachment["phase"],
  since: number | undefined,
): Attachment {
  return since === undefined
    ? { cid: attachment.cid, grantId: attachment.grantId, phase, v: 1 }
    : { cid: attachment.cid, grantId: attachment.grantId, phase, since, v: 1 };
}

function presenceRecord(
  cid: ConnectionId,
  uid: string | undefined,
  data: RpcCall["input"],
  at: number,
): StoredPresence {
  return uid === undefined ? { at, cid, d: data } : { at, cid, d: data, uid };
}

function presenceEntry(record: StoredPresence): PresenceEntry {
  const cid = toConnectionId(record.cid);
  return record.uid === undefined ? { cid, d: record.d } : { cid, d: record.d, uid: record.uid };
}

function orderPresence(records: readonly StoredPresence[]): readonly PresenceEntry[] {
  const ordered: PresenceEntry[] = [];
  for (const record of records) {
    const entry = presenceEntry(record);
    const index = ordered.findIndex((candidate) => candidate.cid > entry.cid);
    if (index === -1) ordered.push(entry);
    else ordered.splice(index, 0, entry);
  }
  return ordered;
}

function toConnectionId(value: string): ConnectionId {
  // SAFETY: Stored presence ids originated from validated ConnectionId attachments.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Engine-owned storage preserves the opaque connection id.
  return value as ConnectionId;
}

function grantIdFromConnection(cid: string): GrantId {
  // SAFETY: Grant records are one-to-one with host-owned connection ids. Using
  // the same validated opaque string makes storage reserve cid uniqueness.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GrantId and ConnectionId share the string representation by engine policy.
  return cid as GrantId;
}

function eventTarget(target: EventTarget): NonNullable<StoredEvent["target"]> {
  if (!("attachment" in target)) return { uid: target.uid };
  const attachment = target.attachment.get();
  if (attachment === undefined) {
    throw new CableError("NOT_FOUND", { message: "Target connection has no attachment" });
  }
  return { cid: attachment.cid };
}

function matchesTarget(connection: Connection, target: StoredEvent["target"]): boolean {
  if (target === undefined) return true;
  const attachment = connection.attachment.get();
  if (target.cid !== undefined) return attachment?.cid === target.cid;
  return target.uid !== undefined && connection.tags.includes(`uid:${target.uid}`);
}

function matchesRecord<TChannel extends AnyChannelContract, TIdentity>(
  record: ConnectionRecord<TChannel, TIdentity>,
  cid: ConnectionId | undefined,
  target: StoredEvent["target"],
): boolean {
  if (target === undefined) return true;
  if (target.cid !== undefined) return cid !== undefined && target.cid === cid;
  return target.uid !== undefined && target.uid === record.uid;
}

function toResultFrame(id: string, result: ProcedureResult): ResultFrame {
  return result.ok
    ? result.data === undefined
      ? { id, ok: true, t: "res" }
      : { d: result.data, id, ok: true, t: "res" }
    : { e: result.error, id, ok: false, t: "res" };
}

function parseHistoryInput(value: RpcCall["input"]): HistoryLoadInput {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CableError("VALIDATION", { message: "history.load input must be an object" });
  }
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "before" && key !== "limit")) {
    throw new CableError("VALIDATION", { message: "history.load input has unknown fields" });
  }
  // SAFETY: The object and allowed keys were checked before reading the two fields.
  const input = value as { readonly before?: unknown; readonly limit?: unknown };
  const before = optionalSequence(input.before, "history.load before");
  const limit = optionalLimit(input.limit);
  if (before === undefined) return limit === undefined ? {} : { limit };
  return limit === undefined ? { before } : { before, limit };
}

function optionalSequence(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new CableError("VALIDATION", { message: `${label} must be a non-negative integer` });
  }
  return value;
}

function optionalLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_HISTORY_LIMIT
  ) {
    throw new CableError("VALIDATION", {
      message: `history.load limit must be an integer from 1 through ${MAX_HISTORY_LIMIT}`,
    });
  }
  return value;
}

function chunkWelcome(
  cid: ConnectionId,
  sequence: number,
  presence: readonly PresenceEntry[],
  replay: readonly EventFrame[],
  reset: true | undefined,
  maximumBytes: number,
): readonly WelcomeFrame[] {
  const items: WelcomeItem[] = [
    ...presence.map((entry) => ({ presence: entry })),
    ...replay.map((event) => ({ event })),
  ];
  if (items.length === 0) {
    const frame = welcomeFrame(cid, sequence, [], [], reset);
    assertWelcomeFrameFits(frame, maximumBytes);
    return [frame];
  }
  const chunks: WelcomeFrame[] = [];
  let parts: WelcomeParts = { presence: [], replay: [] };
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) continue;
    parts = admitWelcomeItem(
      chunks,
      parts,
      item,
      cid,
      sequence,
      reset,
      maximumBytes,
      index < items.length - 1,
    );
  }
  chunks.push(welcomeFrame(cid, sequence, parts.presence, parts.replay, reset));
  return chunks;
}

function admitWelcomeItem(
  chunks: WelcomeFrame[],
  current: WelcomeParts,
  item: WelcomeItem,
  cid: ConnectionId,
  sequence: number,
  reset: true | undefined,
  maximumBytes: number,
  hasFollowingItem: boolean,
): WelcomeParts {
  const next = addWelcomeItem(current, item);
  const candidate = welcomeFrame(
    cid,
    sequence,
    next.presence,
    next.replay,
    reset,
    hasFollowingItem ? true : undefined,
  );
  if (frameBytes(candidate) <= maximumBytes) return next;
  if (current.presence.length > 0 || current.replay.length > 0) {
    chunks.push(welcomeFrame(cid, sequence, current.presence, current.replay, reset, true));
  }
  const single = addWelcomeItem({ presence: [], replay: [] }, item);
  assertWelcomeFrameFits(
    welcomeFrame(cid, sequence, single.presence, single.replay, reset, true),
    maximumBytes,
  );
  return single;
}

function addWelcomeItem(parts: WelcomeParts, item: WelcomeItem): WelcomeParts {
  return {
    presence: item.presence === undefined ? parts.presence : [...parts.presence, item.presence],
    replay: item.event === undefined ? parts.replay : [...parts.replay, item.event],
  };
}

function welcomeFrame(
  cid: ConnectionId,
  seq: number,
  presence: readonly PresenceEntry[],
  replay: readonly EventFrame[],
  reset: true | undefined,
  more?: true,
): WelcomeFrame {
  const base = {
    cid,
    presence,
    replay,
    seq,
    t: "welcome",
    v: 1,
  } as const;
  if (more === undefined) return reset === undefined ? base : { ...base, reset };
  return reset === undefined ? { ...base, more } : { ...base, more, reset };
}

function frameBytes(frame: WelcomeFrame): number {
  return encodedBytes(JSON.stringify(frame));
}

function encodedBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertWelcomeFrameFits(frame: WelcomeFrame, maximumBytes: number): void {
  if (frameBytes(frame) > maximumBytes) {
    throw new CableError("PAYLOAD_TOO_LARGE", { message: "Welcome item exceeds frame limit" });
  }
}

function parseDuration(value: string): number {
  const amount = Number(value.slice(0, -1));
  const unit = value.at(-1);
  const multiplier =
    unit === "s" ? 1_000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return amount * multiplier;
}

function readHandler(handlers: object, name: string): RuntimeClientEvent["handler"] | undefined {
  // SAFETY: The mapped ChannelImplementation type associates each client-event
  // key with this runtime signature; collection pairs it with the same contract key.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Dynamic named dispatch erases one mapped handler member.
  const runtime = handlers as { readonly [key: string]: RuntimeClientEvent["handler"] };
  return Object.hasOwn(runtime, name) ? runtime[name] : undefined;
}

function readProcedure(handlers: object, name: string): RuntimeProcedure["handler"] | undefined {
  // SAFETY: The mapped ChannelImplementation type associates each procedure key
  // with this runtime signature; collection pairs it with the same contract key.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Dynamic named dispatch erases one mapped handler member.
  const runtime = handlers as { readonly [key: string]: RuntimeProcedure["handler"] };
  return Object.hasOwn(runtime, name) ? runtime[name] : undefined;
}

function readTimer(handlers: object, name: string): RuntimeTimer["handler"] | undefined {
  // SAFETY: The mapped ChannelImplementation type associates every timer name
  // with its payload and the engine-created timer context.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Dynamic timer-name dispatch erases one mapped handler member.
  const runtime = handlers as { readonly [key: string]: RuntimeTimer["handler"] };
  return Object.hasOwn(runtime, name) ? runtime[name] : undefined;
}

function requirePeerString(message: PeerMessage, key: string): string {
  const value = message[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new CableError("PARSE_ERROR", { message: `Peer ${key} must be a non-empty string` });
  }
  return value;
}

function optionalPeerString(message: PeerMessage, key: string): string | undefined {
  const value = message[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new CableError("PARSE_ERROR", { message: `Peer ${key} must be a string` });
  }
  return value;
}

function requirePeerStrings(message: PeerMessage, key: string): readonly string[] {
  const value = message[key];
  if (!Array.isArray(value)) {
    throw new CableError("PARSE_ERROR", { message: `Peer ${key} must be a string array` });
  }
  const strings: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      throw new CableError("PARSE_ERROR", { message: `Peer ${key} must be a string array` });
    }
    strings.push(item);
  }
  return strings;
}

function parseHandshakeArgs(value: RpcCall["input"]): {
  readonly cid: ConnectionId;
  readonly grantId: GrantId;
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CableError("INTERNAL", { message: "Invalid handshake timer" });
  }
  // SAFETY: Engine-owned timer storage writes this exact shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Timer kind selects the persisted argument contract.
  return value as { readonly cid: ConnectionId; readonly grantId: GrantId };
}

function findConnection(host: Host, cid: ConnectionId): Connection | undefined {
  for (const connection of host.connections(`cid:${cid}`)) {
    if (connection.attachment.get()?.cid === cid) return connection;
  }
  return undefined;
}

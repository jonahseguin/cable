/* oxlint-disable anti-slop/no-known-value-widening, anti-slop/no-runtime-typeof,
anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type --
This module is the JSON channel trust boundary. It narrows every unknown field
before returning protocol values. Its parsers assemble optional exact-property
results only after validating each field. */
import { CableError } from "./errors.js";
import type { ConnectionId } from "./host.js";
import { assertJsonData } from "./rpc.js";

/** Default maximum UTF-8 bytes accepted for one WebSocket frame. */
export const DEFAULT_MAX_FRAME_BYTES = 1_048_576;

/** Preferred UTF-8 size for one replay/presence welcome chunk. */
export const DEFAULT_REPLAY_CHUNK_BYTES = 262_144;

/** Protocol negotiation sent as the first JSON frame on a new socket. */
export interface HelloFrame {
  readonly enc?: "json";
  readonly since?: number;
  readonly t: "hello";
  readonly v: 1;
}

/** A client event, optionally requesting a result acknowledgement. */
export interface EmitFrame {
  readonly d?: unknown;
  readonly ev: string;
  readonly id?: string;
  readonly t: "emit";
}

/** A host-scoped procedure invocation. */
export interface CallFrame {
  readonly d?: unknown;
  readonly id: string;
  readonly p: string;
  readonly t: "call";
}

/** A connection's complete current presence state. */
export interface PresenceUpdateFrame {
  readonly d?: unknown;
  readonly t: "presence";
}

/** JSON frames accepted from a client after literal ping handling. */
export type ClientFrame = CallFrame | EmitFrame | HelloFrame | PresenceUpdateFrame;

/** Every wire value accepted from a client. */
export type ClientWireFrame = ClientFrame | "ping";

/** One logged, ordered server event. */
export interface EventFrame {
  readonly d?: unknown;
  readonly ev: string;
  readonly seq: number;
  readonly t: "ev";
}

/** One targeted event that does not advance the durable cursor. */
export interface TargetedEventFrame {
  readonly d?: unknown;
  readonly ev: string;
  readonly t: "evt";
}

/** One member of a presence snapshot or diff. */
export interface PresenceEntry {
  readonly cid: ConnectionId;
  readonly d?: unknown;
  readonly uid?: string;
}

/**
 * One chunk of the hello response.
 *
 * All chunks repeat `cid`, `seq`, and `reset`. Presence and replay arrays are
 * partitions of one snapshot. `more: true` means another welcome chunk follows.
 */
export interface WelcomeFrame {
  readonly cid: ConnectionId;
  readonly more?: true;
  readonly presence: readonly PresenceEntry[];
  readonly replay: readonly EventFrame[];
  readonly reset?: true;
  readonly seq: number;
  readonly t: "welcome";
  readonly v: 1;
}

/** An application or built-in error safe to expose over a channel. */
export interface ChannelWireError {
  readonly code: string;
  readonly data?: unknown;
  readonly message?: string;
}

/** A successful reply to `call` or acknowledged `emit`. */
export interface ResultSuccessFrame {
  readonly d?: unknown;
  readonly id: string;
  readonly ok: true;
  readonly t: "res";
}

/** A failed reply to `call` or acknowledged `emit`. */
export interface ResultFailureFrame {
  readonly e: ChannelWireError;
  readonly id: string;
  readonly ok: false;
  readonly t: "res";
}

/** The independent result of one request-correlated channel operation. */
export type ResultFrame = ResultFailureFrame | ResultSuccessFrame;

/** Presence changes committed after the receiver's welcome snapshot. */
export interface PresenceFrame {
  readonly join?: readonly PresenceEntry[];
  readonly leave?: readonly ConnectionId[];
  readonly t: "presence";
  readonly update?: readonly PresenceEntry[];
}

/** A non-fatal protocol error that is not tied to a request ID. */
export interface ProtocolErrorFrame {
  readonly code: string;
  readonly message?: string;
  readonly t: "err";
}

/** A host instruction sent immediately before closing the socket. */
export interface ByeFrame {
  readonly code: number;
  readonly reason: string;
  readonly retry?: number;
  readonly t: "bye";
}

/** JSON frames sent by a host after literal pong handling. */
export type HostFrame =
  | ByeFrame
  | EventFrame
  | PresenceFrame
  | ProtocolErrorFrame
  | ResultFrame
  | TargetedEventFrame
  | WelcomeFrame;

/** Every wire value sent by a host. */
export type HostWireFrame = HostFrame | "pong";

interface UnparsedRecord {
  readonly [key: string]: unknown;
}

/** Encode and size-check a client frame without applying JSON conversions. */
export function encodeClientFrame(
  frame: ClientWireFrame,
  maxFrameBytes: number = DEFAULT_MAX_FRAME_BYTES,
): string {
  assertFrameLimit(maxFrameBytes);
  if (frame === "ping") return frame;
  assertJsonData(frame, "BAD_REQUEST");
  const parsed = parseClientValue(frame);
  return encodeFrame(parsed, maxFrameBytes, "BAD_REQUEST");
}

/** Parse and validate an untrusted frame received from a client. */
export function decodeClientFrame(
  data: string | ArrayBuffer,
  maxFrameBytes: number = DEFAULT_MAX_FRAME_BYTES,
): ClientWireFrame {
  const text = decodeTextFrame(data, maxFrameBytes);
  if (text === "ping") return text;
  return parseClientValue(parseJson(text));
}

/** Encode and size-check a host frame without applying JSON conversions. */
export function encodeHostFrame(
  frame: HostWireFrame,
  maxFrameBytes: number = DEFAULT_MAX_FRAME_BYTES,
): string {
  assertFrameLimit(maxFrameBytes);
  if (frame === "pong") return frame;
  assertJsonData(frame, "INTERNAL");
  const parsed = parseHostValue(frame);
  return encodeFrame(parsed, maxFrameBytes, "INTERNAL");
}

/** Parse and validate an untrusted frame received from a host. */
export function decodeHostFrame(
  data: string | ArrayBuffer,
  maxFrameBytes: number = DEFAULT_MAX_FRAME_BYTES,
): HostWireFrame {
  const text = decodeTextFrame(data, maxFrameBytes);
  if (text === "pong") return text;
  return parseHostValue(parseJson(text));
}

function parseClientValue(value: unknown): ClientFrame {
  const frame = requireRecord(value, "Client frame");
  switch (frame["t"]) {
    case "hello":
      return parseHello(frame);
    case "emit":
      return parseEmit(frame);
    case "call":
      return parseCall(frame);
    case "presence":
      return parsePresenceUpdate(frame);
    default:
      throw protocolError("Unknown client frame type");
  }
}

function parseHostValue(value: unknown): HostFrame {
  const frame = requireRecord(value, "Host frame");
  switch (frame["t"]) {
    case "welcome":
      return parseWelcome(frame);
    case "ev":
      return parseEvent(frame);
    case "evt":
      return parseTargetedEvent(frame);
    case "res":
      return parseResult(frame);
    case "presence":
      return parsePresence(frame);
    case "err":
      return parseProtocolError(frame);
    case "bye":
      return parseBye(frame);
    default:
      throw protocolError("Unknown host frame type");
  }
}

function parseHello(frame: UnparsedRecord): HelloFrame {
  assertKeys(frame, ["enc", "since", "t", "v"], "hello");
  if (frame["v"] !== 1) throw protocolError("hello.v must be 1");
  if (frame["enc"] !== undefined && frame["enc"] !== "json") {
    throw protocolError("hello.enc must be 'json'");
  }
  assertOptionalSequence(frame["since"], "hello.since");
  const result: { enc?: "json"; since?: number; t: "hello"; v: 1 } = {
    t: "hello",
    v: 1,
  };
  if (frame["enc"] === "json") result.enc = "json";
  if (typeof frame["since"] === "number") result.since = frame["since"];
  return result;
}

function parseEmit(frame: UnparsedRecord): EmitFrame {
  assertKeys(frame, ["d", "ev", "id", "t"], "emit");
  const event = requireNonemptyString(frame["ev"], "emit.ev");
  const id = optionalNonemptyString(frame["id"], "emit.id");
  const result: { d?: unknown; ev: string; id?: string; t: "emit" } = {
    ev: event,
    t: "emit",
  };
  if (Object.hasOwn(frame, "d")) result.d = frame["d"];
  if (id !== undefined) result.id = id;
  return result;
}

function parseCall(frame: UnparsedRecord): CallFrame {
  assertKeys(frame, ["d", "id", "p", "t"], "call");
  const result: { d?: unknown; id: string; p: string; t: "call" } = {
    id: requireNonemptyString(frame["id"], "call.id"),
    p: requireNonemptyString(frame["p"], "call.p"),
    t: "call",
  };
  if (Object.hasOwn(frame, "d")) result.d = frame["d"];
  return result;
}

function parsePresenceUpdate(frame: UnparsedRecord): PresenceUpdateFrame {
  assertKeys(frame, ["d", "t"], "presence update");
  return Object.hasOwn(frame, "d") ? { d: frame["d"], t: "presence" } : { t: "presence" };
}

function parseEvent(frame: UnparsedRecord): EventFrame {
  assertKeys(frame, ["d", "ev", "seq", "t"], "ev");
  const result: { d?: unknown; ev: string; seq: number; t: "ev" } = {
    ev: requireNonemptyString(frame["ev"], "ev.ev"),
    seq: requireSequence(frame["seq"], "ev.seq"),
    t: "ev",
  };
  if (Object.hasOwn(frame, "d")) result.d = frame["d"];
  return result;
}

function parseTargetedEvent(frame: UnparsedRecord): TargetedEventFrame {
  assertKeys(frame, ["d", "ev", "t"], "evt");
  const result: { d?: unknown; ev: string; t: "evt" } = {
    ev: requireNonemptyString(frame["ev"], "evt.ev"),
    t: "evt",
  };
  if (Object.hasOwn(frame, "d")) result.d = frame["d"];
  return result;
}

function parseWelcome(frame: UnparsedRecord): WelcomeFrame {
  assertKeys(frame, ["cid", "more", "presence", "replay", "reset", "seq", "t", "v"], "welcome");
  if (frame["v"] !== 1) throw protocolError("welcome.v must be 1");
  if (frame["more"] !== undefined && frame["more"] !== true) {
    throw protocolError("welcome.more must be true when present");
  }
  if (frame["reset"] !== undefined && frame["reset"] !== true) {
    throw protocolError("welcome.reset must be true when present");
  }
  const presence = requireArray(frame["presence"], "welcome.presence").map(parsePresenceEntry);
  const replay = requireArray(frame["replay"], "welcome.replay").map((event) =>
    parseEvent(requireRecord(event, "welcome.replay event")),
  );
  if (frame["reset"] === true && replay.length > 0) {
    throw protocolError("A reset welcome cannot contain replay events");
  }
  assertUniquePresence(presence, undefined, undefined);
  assertAscendingReplay(replay);
  const sequence = requireSequence(frame["seq"], "welcome.seq");
  const latestReplay = replay.at(-1);
  if (latestReplay !== undefined && latestReplay.seq > sequence) {
    throw protocolError("welcome.replay cannot advance beyond welcome.seq");
  }
  const result: {
    cid: ConnectionId;
    more?: true;
    presence: readonly PresenceEntry[];
    replay: readonly EventFrame[];
    reset?: true;
    seq: number;
    t: "welcome";
    v: 1;
  } = {
    cid: requireConnectionId(frame["cid"], "welcome.cid"),
    presence,
    replay,
    seq: sequence,
    t: "welcome",
    v: 1,
  };
  if (frame["more"] === true) result.more = true;
  if (frame["reset"] === true) result.reset = true;
  return result;
}

function parseResult(frame: UnparsedRecord): ResultFrame {
  const id = requireNonemptyString(frame["id"], "res.id");
  if (frame["ok"] === true) {
    assertKeys(frame, ["d", "id", "ok", "t"], "successful res");
    return Object.hasOwn(frame, "d")
      ? { d: frame["d"], id, ok: true, t: "res" }
      : { id, ok: true, t: "res" };
  }
  if (frame["ok"] === false) {
    assertKeys(frame, ["e", "id", "ok", "t"], "failed res");
    return { e: parseChannelError(frame["e"]), id, ok: false, t: "res" };
  }
  throw protocolError("res.ok must be a boolean");
}

function parseChannelError(value: unknown): ChannelWireError {
  const error = requireRecord(value, "res.e");
  assertKeys(error, ["code", "data", "message"], "res.e");
  const message = optionalString(error["message"], "res.e.message");
  const result: { code: string; data?: unknown; message?: string } = {
    code: requireNonemptyString(error["code"], "res.e.code"),
  };
  if (Object.hasOwn(error, "data")) result.data = error["data"];
  if (message !== undefined) result.message = message;
  return result;
}

function parsePresence(frame: UnparsedRecord): PresenceFrame {
  assertKeys(frame, ["join", "leave", "t", "update"], "presence");
  const join = optionalArray(frame["join"], "presence.join")?.map(parsePresenceEntry);
  const update = optionalArray(frame["update"], "presence.update")?.map(parsePresenceEntry);
  const leave = optionalArray(frame["leave"], "presence.leave")?.map((cid) =>
    requireConnectionId(cid, "presence.leave cid"),
  );
  if ((join?.length ?? 0) + (update?.length ?? 0) + (leave?.length ?? 0) === 0) {
    throw protocolError("presence must contain at least one change");
  }
  assertUniquePresence(join, update, leave);
  const result: {
    join?: readonly PresenceEntry[];
    leave?: readonly ConnectionId[];
    t: "presence";
    update?: readonly PresenceEntry[];
  } = { t: "presence" };
  if (join !== undefined) result.join = join;
  if (leave !== undefined) result.leave = leave;
  if (update !== undefined) result.update = update;
  return result;
}

function parsePresenceEntry(value: unknown): PresenceEntry {
  const entry = requireRecord(value, "Presence entry");
  assertKeys(entry, ["cid", "d", "uid"], "presence entry");
  const uid = optionalString(entry["uid"], "presence entry uid");
  const result: { cid: ConnectionId; d?: unknown; uid?: string } = {
    cid: requireConnectionId(entry["cid"], "presence entry cid"),
  };
  if (Object.hasOwn(entry, "d")) result.d = entry["d"];
  if (uid !== undefined) result.uid = uid;
  return result;
}

function parseProtocolError(frame: UnparsedRecord): ProtocolErrorFrame {
  assertKeys(frame, ["code", "message", "t"], "err");
  const message = optionalString(frame["message"], "err.message");
  return message === undefined
    ? { code: requireNonemptyString(frame["code"], "err.code"), t: "err" }
    : { code: requireNonemptyString(frame["code"], "err.code"), message, t: "err" };
}

function parseBye(frame: UnparsedRecord): ByeFrame {
  assertKeys(frame, ["code", "reason", "retry", "t"], "bye");
  const code = frame["code"];
  if (typeof code !== "number" || !Number.isSafeInteger(code) || code < 1000 || code > 4999) {
    throw protocolError("bye.code must be an integer WebSocket close code");
  }
  const retry = frame["retry"];
  if (
    retry !== undefined &&
    (typeof retry !== "number" || !Number.isSafeInteger(retry) || retry < 0)
  ) {
    throw protocolError("bye.retry must be a non-negative integer");
  }
  const result: { code: number; reason: string; retry?: number; t: "bye" } = {
    code,
    reason: requireString(frame["reason"], "bye.reason"),
    t: "bye",
  };
  if (typeof retry === "number") result.retry = retry;
  return result;
}

function decodeTextFrame(data: string | ArrayBuffer, maxFrameBytes: number): string {
  assertFrameLimit(maxFrameBytes);
  if (typeof data !== "string") {
    if (data.byteLength > maxFrameBytes) throw protocolError("Frame exceeds maxFrameBytes");
    throw protocolError("Binary frames are not supported by protocol v1");
  }
  if (utf8Bytes(data) > maxFrameBytes) throw protocolError("Frame exceeds maxFrameBytes");
  return data;
}

function encodeFrame(
  frame: ClientFrame | HostFrame,
  maxFrameBytes: number,
  code: "BAD_REQUEST" | "INTERNAL",
): string {
  const encoded = JSON.stringify(frame);
  if (utf8Bytes(encoded) > maxFrameBytes) {
    throw new CableError(code, { message: "Frame exceeds maxFrameBytes" });
  }
  return encoded;
}

// oxlint-disable-next-line anti-slop/no-unknown-returns -- The frame-specific parser consumes this value immediately and establishes its protocol type.
function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    assertJsonData(parsed, "BAD_REQUEST");
    return parsed;
  } catch (cause) {
    throw new CableError("PARSE_ERROR", { cause, message: "Invalid channel JSON" });
  }
}

function requireRecord(value: unknown, label: string): UnparsedRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw protocolError(`${label} must be an object`);
  }
  // SAFETY: Null, primitive, and array representations were rejected above;
  // own properties remain unknown until the frame-specific parser checks them.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This is the single JSON object representation boundary.
  return value as UnparsedRecord;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw protocolError(`${label} must be an array`);
  return value;
}

function optionalArray(value: unknown, label: string): readonly unknown[] | undefined {
  return value === undefined ? undefined : requireArray(value, label);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw protocolError(`${label} must be a string`);
  return value;
}

function requireNonemptyString(value: unknown, label: string): string {
  const result = requireString(value, label);
  if (result.length === 0) throw protocolError(`${label} must not be empty`);
  return result;
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requireString(value, label);
}

function optionalNonemptyString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requireNonemptyString(value, label);
}

function requireConnectionId(value: unknown, label: string): ConnectionId {
  const id = requireNonemptyString(value, label);
  // SAFETY: ConnectionId is an opaque wire string after non-empty validation.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The brand records the validation immediately above.
  return id as ConnectionId;
}

function requireSequence(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw protocolError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function assertOptionalSequence(value: unknown, label: string): void {
  if (value !== undefined) requireSequence(value, label);
}

function assertKeys(frame: UnparsedRecord, allowed: readonly string[], label: string): void {
  const key = Object.keys(frame).find((candidate) => !allowed.includes(candidate));
  if (key !== undefined) throw protocolError(`${label} has unknown key '${key}'`);
}

function assertAscendingReplay(replay: readonly EventFrame[]): void {
  for (let index = 1; index < replay.length; index += 1) {
    const previous = replay[index - 1];
    const current = replay[index];
    if (previous === undefined || current === undefined || current.seq <= previous.seq) {
      throw protocolError("welcome.replay must be strictly ascending");
    }
  }
}

function assertUniquePresence(
  join: readonly PresenceEntry[] | undefined,
  update: readonly PresenceEntry[] | undefined,
  leave: readonly ConnectionId[] | undefined,
): void {
  const seen = new Set<string>();
  for (const cid of [
    ...(join?.map((entry) => entry.cid) ?? []),
    ...(update?.map((entry) => entry.cid) ?? []),
    ...(leave ?? []),
  ]) {
    if (seen.has(cid)) throw protocolError(`presence repeats connection '${cid}'`);
    seen.add(cid);
  }
}

function assertFrameLimit(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("maxFrameBytes must be a positive safe integer");
  }
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function protocolError(message: string): CableError<"PARSE_ERROR"> {
  return new CableError("PARSE_ERROR", { message });
}

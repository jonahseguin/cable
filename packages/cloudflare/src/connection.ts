/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters,
anti-slop/no-unsafe-dictionary-type, anti-slop/no-chained-type-assertions --
Cloudflare returns structured-clone data as unknown; parseAttachment checks the
complete persisted shape before the engine receives it. */
import type { Attachment, Connection, ConnectionId } from "@cable/core";

import type { CloudflareSocketState, HibernatableSocket } from "./runtime.js";

const CONNECTION_TAG_PREFIX = "cid:";
const DEFAULT_ATTACHMENT_BYTES = 16_384;

/** Reconstruct one Cable connection from a hibernatable Cloudflare socket. */
export class CloudflareConnection implements Connection {
  public readonly attachment: Connection["attachment"];
  public readonly id: ConnectionId;
  public readonly tags: readonly string[];
  private readonly maxAttachmentBytes: number;
  private readonly socket: HibernatableSocket;

  public constructor(
    socket: WebSocket,
    state: CloudflareSocketState,
    maxAttachmentBytes = DEFAULT_ATTACHMENT_BYTES,
  ) {
    this.maxAttachmentBytes = maxAttachmentBytes;
    if (!isHibernatableSocket(socket)) {
      throw new TypeError("Cloudflare socket does not support serialized attachments");
    }
    this.socket = socket;
    this.tags = Object.freeze(this.readTags(state));
    this.id = connectionIdFromTags(this.tags);
    this.attachment = Object.freeze({
      get: () => this.readAttachment(),
      set: (attachment: Attachment) => {
        this.writeAttachment(attachment);
      },
    });
  }

  // fallow-ignore-next-line code-duplication -- Cloudflare owns hibernatable socket forwarding; Node attachment state has a different native lifecycle.
  public close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  public send(frame: string | ArrayBuffer): void {
    this.socket.send(frame);
  }

  private readAttachment(): Attachment | undefined {
    const value: unknown = this.socket.deserializeAttachment();
    return parseAttachment(value, this.id);
  }

  private readTags(state: CloudflareSocketState): string[] {
    try {
      return [...state.getTags(this.socket)];
    } catch (error) {
      if (!isClosedSocketTagError(error)) throw error;
      const attachment = parseAttachment(this.socket.deserializeAttachment());
      if (attachment === undefined)
        throw new TypeError("Cloudflare socket has no Cable attachment", { cause: error });
      return [`${CONNECTION_TAG_PREFIX}${attachment.cid}`];
    }
  }

  private writeAttachment(attachment: Attachment): void {
    if (attachment.cid !== this.id) {
      throw new TypeError("Connection attachment id does not match its immutable tag");
    }
    const bytes = new TextEncoder().encode(JSON.stringify(attachment)).byteLength;
    if (bytes > this.maxAttachmentBytes) {
      throw new RangeError(
        `Connection attachment exceeds ${String(this.maxAttachmentBytes)} UTF-8 bytes`,
      );
    }
    this.socket.serializeAttachment(attachment);
  }
}

function isClosedSocketTagError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message ===
      "you must call 'acceptWebSocket()' before attempting to access the tags of a WebSocket."
  );
}

export function connectionIdFromTags(tags: readonly string[]): ConnectionId {
  const ids = tags
    .filter((tag) => tag.startsWith(CONNECTION_TAG_PREFIX))
    .map((tag) => tag.slice(CONNECTION_TAG_PREFIX.length));
  if (ids.length !== 1 || ids[0] === undefined || ids[0].length === 0) {
    throw new TypeError("Cloudflare socket requires exactly one non-empty cid tag");
  }
  // SAFETY: The engine creates connection ids as non-empty strings and the
  // immutable cid tag is their persisted Cloudflare representation.
  // SAFETY: The single non-empty cid tag is the persisted connection id.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The tag validation establishes the opaque id representation.
  return ids[0] as ConnectionId;
}

function isHibernatableSocket(socket: WebSocket): socket is HibernatableSocket {
  return (
    "deserializeAttachment" in socket &&
    typeof socket.deserializeAttachment === "function" &&
    "serializeAttachment" in socket &&
    typeof socket.serializeAttachment === "function"
  );
}

/** Parse persisted socket metadata without trusting structured-clone output. */
export function parseAttachment(value: unknown, connectionId?: string): Attachment | undefined {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (
    !keys.every((key) => ["cid", "grantId", "phase", "since", "v"].includes(key)) ||
    keys.length < 4 ||
    keys.length > 5
  ) {
    return undefined;
  }
  if (
    value["v"] === 1 &&
    typeof value["cid"] === "string" &&
    value["cid"].length > 0 &&
    typeof value["grantId"] === "string" &&
    value["grantId"].length > 0 &&
    (value["phase"] === "pending" || value["phase"] === "resuming" || value["phase"] === "ready") &&
    (value["since"] === undefined ||
      (Number.isSafeInteger(value["since"]) && Number(value["since"]) >= 0))
  ) {
    if (connectionId !== undefined && value["cid"] !== connectionId) return undefined;
    // SAFETY: Every persisted field was checked above and the cid matches the
    // immutable socket tag used to reconstruct this connection.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Attachment parsing establishes the branded persisted shape.
    return value as unknown as Attachment;
  }
  return undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object") return false;
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- Cloudflare structured-clone data is narrowed by its prototype and fields below.
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

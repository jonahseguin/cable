import type { Attachment, Connection, ConnectionId } from "@cable/core";

/** The subset of a `ws` socket used by the runtime-neutral Connection wrapper. */
export interface NodeSocket {
  readonly bufferedAmount: number;
  close(code?: number, reason?: string): void;
  send(frame: string | ArrayBuffer): void;
}

/** A live Node WebSocket paired with process-local Cable attachment metadata. */
export class NodeConnection implements Connection {
  public readonly attachment: Connection["attachment"];
  public readonly id: ConnectionId;
  public readonly tags: readonly string[];
  private metadata: Attachment;
  private readonly maxAttachmentBytes: number;
  private readonly socket: NodeSocket;

  public constructor(
    socket: NodeSocket,
    tags: readonly string[],
    attachment: Attachment,
    maxAttachmentBytes: number,
  ) {
    this.socket = socket;
    this.tags = Object.freeze([...tags]);
    this.id = attachment.cid;
    this.maxAttachmentBytes = maxAttachmentBytes;
    this.assertAttachment(attachment);
    this.metadata = structuredClone(attachment);
    this.attachment = Object.freeze({
      get: () => structuredClone(this.metadata),
      set: (next) => {
        if (next.cid !== this.id)
          throw new TypeError("Connection attachment id does not match its socket");
        this.assertAttachment(next);
        this.metadata = structuredClone(next);
      },
    });
  }

  public get bufferedAmount(): number {
    return this.socket.bufferedAmount;
  }

  // fallow-ignore-next-line code-duplication -- Node owns ws socket forwarding; Cloudflare attachment serialization has a different native lifecycle.
  public close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  public send(frame: string | ArrayBuffer): void {
    this.socket.send(frame);
  }

  private assertAttachment(attachment: Attachment): void {
    if (new TextEncoder().encode(JSON.stringify(attachment)).byteLength > this.maxAttachmentBytes) {
      throw new RangeError("Connection attachment exceeds the Host attachment byte limit.");
    }
  }
}

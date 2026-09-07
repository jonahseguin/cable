import type { Attachment, Connection, ConnectionId } from "@cablejs/core";

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** Queue used to preserve browser event and Host callback ordering. */
export type MemorySocketDispatch = (operation: () => Promise<void> | void) => void;

/** Server callbacks attached after an in-memory upgrade is accepted. */
export interface MemorySocketCallbacks {
  readonly close: (code: number, reason: string, wasClean: boolean) => Promise<void>;
  readonly message: (data: string | ArrayBuffer) => Promise<void>;
  readonly terminate: () => void;
}

function closeEvent(code: number, reason: string, wasClean: boolean): Event {
  const event = new Event("close");
  Object.defineProperties(event, {
    code: { enumerable: true, value: code },
    reason: { enumerable: true, value: reason },
    wasClean: { enumerable: true, value: wasClean },
  });
  return event;
}

/** Browser-compatible client side of an in-memory channel socket. */
export class MemorySocket extends EventTarget {
  private callbacks: MemorySocketCallbacks | undefined;
  private readonly dispatch: MemorySocketDispatch;
  private state = CONNECTING;

  constructor(dispatch: MemorySocketDispatch) {
    super();
    this.dispatch = dispatch;
  }

  /** The WebSocket-compatible connection state. */
  get readyState(): number {
    return this.state;
  }

  override addEventListener<Type extends keyof WebSocketEventMap>(
    type: Type,
    listener: (event: WebSocketEventMap[Type]) => void,
  ): void;
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void;
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    super.addEventListener(type, listener, options);
  }

  /** Send one client protocol frame after the asynchronous open event. */
  send(data: string | ArrayBuffer): void {
    if (this.state !== OPEN || this.callbacks === undefined) {
      throw new DOMException("Socket is not open.", "InvalidStateError");
    }
    const callbacks = this.callbacks;
    this.dispatch(() => callbacks.message(data));
  }

  /** Start a clean client close handshake. */
  close(code = 1_000, reason = ""): void {
    if (this.state === CLOSING || this.state === CLOSED) return;
    this.state = CLOSING;
    const callbacks = this.callbacks;
    if (callbacks === undefined) {
      this.dispatch(() => {
        this.finishClose(code, reason, true);
      });
      return;
    }
    this.dispatch(async () => {
      try {
        await callbacks.close(code, reason, true);
      } finally {
        this.finishClose(code, reason, true);
      }
    });
  }

  /** Drop the socket without a close callback, as when a runtime loses a connection. */
  terminate(): void {
    if (this.state === CLOSED) return;
    this.state = CLOSED;
    this.callbacks?.terminate();
    this.callbacks = undefined;
    this.dispatch(() => {
      this.dispatchEvent(closeEvent(1_006, "", false));
    });
  }

  /** Bind the accepted server connection and queue the browser open event. */
  accept(callbacks: MemorySocketCallbacks): void {
    if (this.state !== CONNECTING) return;
    this.callbacks = callbacks;
    this.dispatch(() => {
      if (this.state !== CONNECTING) return;
      this.state = OPEN;
      this.dispatchEvent(new Event("open"));
    });
  }

  /** Reject an upgrade and close the client without exposing a server connection. */
  reject(): void {
    if (this.state !== CONNECTING) return;
    this.state = CLOSED;
    this.dispatch(() => {
      this.dispatchEvent(new Event("error"));
      this.dispatchEvent(closeEvent(1_006, "", false));
    });
  }

  /** Deliver one server frame to browser listeners. */
  receive(data: string | ArrayBuffer): void {
    if (this.state !== OPEN) return;
    this.dispatch(() => {
      this.dispatchEvent(new MessageEvent("message", { data }));
    });
  }

  /** Complete a server-initiated close. */
  serverClose(code = 1_000, reason = ""): void {
    if (this.state === CLOSED) return;
    this.state = CLOSING;
    this.dispatch(() => {
      this.finishClose(code, reason, true);
    });
  }

  private finishClose(code: number, reason: string, wasClean: boolean): void {
    if (this.state === CLOSED) return;
    this.state = CLOSED;
    this.callbacks = undefined;
    this.dispatchEvent(closeEvent(code, reason, wasClean));
  }
}

/** Server-side connection retained by a MemoryHost across engine reconstruction. */
export class MemoryConnection implements Connection {
  readonly bufferedAmount = 0;
  readonly id: ConnectionId;
  readonly tags: readonly string[];
  readonly attachment: Connection["attachment"];
  private metadata: Attachment;
  private readonly maxAttachmentBytes: number;
  private readonly onServerClose: (code: number, reason: string) => void;
  private readonly socket: MemorySocket;

  constructor(
    id: ConnectionId,
    tags: readonly string[],
    attachment: Attachment,
    socket: MemorySocket,
    onServerClose: (code: number, reason: string) => void,
    maxAttachmentBytes = Number.POSITIVE_INFINITY,
  ) {
    this.id = id;
    this.tags = Object.freeze([...tags]);
    this.metadata = structuredClone(attachment);
    this.socket = socket;
    this.onServerClose = onServerClose;
    this.maxAttachmentBytes = maxAttachmentBytes;
    this.assertAttachmentSize(attachment);
    this.attachment = {
      get: () => structuredClone(this.metadata),
      set: (next) => {
        this.assertAttachmentSize(next);
        this.metadata = structuredClone(next);
      },
    };
  }

  send(frame: string | ArrayBuffer): void {
    this.socket.receive(frame);
  }

  close(code = 1_000, reason = ""): void {
    this.onServerClose(code, reason);
    this.socket.serverClose(code, reason);
  }

  private assertAttachmentSize(attachment: Attachment): void {
    const bytes = new TextEncoder().encode(JSON.stringify(attachment)).byteLength;
    if (bytes > this.maxAttachmentBytes) {
      throw new RangeError("Connection attachment exceeds the Host attachment byte limit.");
    }
  }
}

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns,
anti-slop/no-unsafe-dictionary-type -- These structural declarations mirror
Cloudflare's serialized-attachment and Durable Object callback boundaries. */
import type { PeerMessage } from "@cablejs/core";

/** The methods Cable exposes on each generated Durable Object. */
export interface CableDurableObject {
  __cable_peer(message: PeerMessage): Promise<unknown>;
  alarm(): Promise<void>;
  fetch(request: Request): Promise<Response>;
  webSocketClose(socket: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void>;
  webSocketError(socket: WebSocket, error: unknown): Promise<void>;
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void>;
}

/** The portion of a Cable Durable Object stub used by edge and peer routing. */
export interface CableDurableObjectStub {
  __cable_peer(message: PeerMessage): Promise<unknown>;
  fetch(request: Request): Promise<Response>;
}

/** A structural Durable Object namespace accepted by `createHandler`. */
export interface CableDurableObjectNamespace {
  getByName(name: string): CableDurableObjectStub;
}

export interface HibernatableSocket extends WebSocket {
  deserializeAttachment(): unknown;
  serializeAttachment(value: unknown): void;
}

export interface CloudflareSocketState {
  acceptWebSocket(socket: WebSocket, tags?: string[]): void;
  getTags(socket: WebSocket): string[];
  getWebSockets(tag?: string): WebSocket[];
  setWebSocketAutoResponse(pair?: WebSocketRequestResponsePair): void;
  waitUntil(promise: Promise<unknown>): void;
}

export interface CloudflareKvStorage {
  delete(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<number>;
  get<T = unknown>(key: string): Promise<T | undefined>;
  get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
  list<T = unknown>(options?: {
    end?: string;
    limit?: number;
    prefix?: string;
    reverse?: boolean;
    start?: string;
  }): Promise<Map<string, T>>;
  put(key: string, value: unknown): Promise<void>;
  put(entries: Record<string, unknown>): Promise<void>;
}

export interface CloudflareTransaction extends CloudflareKvStorage {}

export interface CloudflareDurableStorage extends CloudflareKvStorage {
  deleteAlarm(): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(at: number): Promise<void>;
  transaction<T>(operation: (transaction: CloudflareTransaction) => Promise<T>): Promise<T>;
}

export interface CloudflareObjectState extends CloudflareSocketState {
  readonly id: { readonly name?: string };
  readonly storage: CloudflareDurableStorage;
}

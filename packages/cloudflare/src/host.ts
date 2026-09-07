/* oxlint-disable anti-slop/no-runtime-typeof -- hibernatableSocket checks the
two Cloudflare extension methods before this adapter uses them. */
import type { Host, HostKey, HostLimits, PeerMessage, Peers, Schedule } from "@cablejs/core";

import { CloudflareConnection } from "./connection.js";
import type {
  CableDurableObjectStub,
  CloudflareObjectState,
  HibernatableSocket,
} from "./runtime.js";
import { CloudflareStorage } from "./storage.js";

const ATTACHMENT_BYTES = 16_384;
const MAX_FRAME_BYTES = 1_048_576;
const MAX_HOST_KEY_BYTES = 1_024;

/** Runtime limits used by the Cloudflare adapter. */
export const CLOUDFLARE_HOST_LIMITS: HostLimits = Object.freeze({
  attachmentBytes: ATTACHMENT_BYTES,
  maxFrameBytes: MAX_FRAME_BYTES,
});

/** Resolve a target host key to its Durable Object RPC stub. */
export type CloudflarePeerResolver<TEnv> = (env: TEnv, key: HostKey) => CableDurableObjectStub;

/** Cloudflare-backed capabilities supplied to the portable channel engine. */
export class CloudflareHost<TEnv> implements Host {
  public readonly key: HostKey;
  public readonly limits: HostLimits;
  public readonly peers: Peers;
  public readonly schedule: Schedule;
  public readonly storage: CloudflareStorage;
  private readonly clock: () => number;
  private readonly state: CloudflareObjectState;

  public constructor(
    state: CloudflareObjectState,
    env: TEnv,
    peer: CloudflarePeerResolver<TEnv>,
    clock: () => number = Date.now,
    limits: HostLimits = CLOUDFLARE_HOST_LIMITS,
  ) {
    this.state = state;
    this.limits = limits;
    this.clock = clock;
    this.key = hostKeyFromState(state);
    this.storage = new CloudflareStorage(state.storage);
    this.schedule = new CloudflareSchedule(state.storage);
    this.peers = new CloudflarePeers(env, peer);
  }

  public autoResponse(request: string, response: string): void {
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair(request, response));
  }

  public connections(tag?: string): Iterable<CloudflareConnection> {
    return this.state
      .getWebSockets(tag)
      .map((socket) => new CloudflareConnection(socket, this.state, this.limits.attachmentBytes));
  }

  public now(): number {
    return this.clock();
  }

  public waitUntil(promise: Promise<unknown>): void {
    this.state.waitUntil(promise);
  }
}

class CloudflareSchedule implements Schedule {
  private readonly storage: CloudflareObjectState["storage"];

  public constructor(storage: CloudflareObjectState["storage"]) {
    this.storage = storage;
  }

  public async clear(): Promise<void> {
    await this.storage.deleteAlarm();
  }

  public get(): Promise<number | null> {
    return this.storage.getAlarm();
  }

  public async set(at: number): Promise<void> {
    await this.storage.setAlarm(at);
  }
}

class CloudflarePeers<TEnv> implements Peers {
  private readonly env: TEnv;
  private readonly resolve: CloudflarePeerResolver<TEnv>;

  public constructor(env: TEnv, resolve: CloudflarePeerResolver<TEnv>) {
    this.env = env;
    this.resolve = resolve;
  }

  public async call<T>(key: HostKey, message: PeerMessage): Promise<T> {
    // oxlint-disable-next-line eslint/no-underscore-dangle -- The Durable Object RPC name is a reserved Cable wire boundary.
    const result = await this.resolve(this.env, key).__cable_peer(message);
    // SAFETY: The caller selects T for its operation-specific peer envelope;
    // the core engine parses that envelope before exposing its result.
    // SAFETY: The receiving core engine parses each operation-specific RPC result before this generic caller observes it.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The operation-specific caller owns T.
    return result as T;
  }

  public async send(key: HostKey, message: PeerMessage): Promise<void> {
    // oxlint-disable-next-line eslint/no-underscore-dangle -- The Durable Object RPC name is a reserved Cable wire boundary.
    await this.resolve(this.env, key).__cable_peer(message);
  }
}

function hostKeyFromState(state: CloudflareObjectState): HostKey {
  const name = state.id.name;
  if (name === undefined || name.length === 0) {
    throw new TypeError("Cable Durable Objects must be reached with getByName");
  }
  if (new TextEncoder().encode(name).byteLength > MAX_HOST_KEY_BYTES) {
    throw new TypeError("Cable Durable Object name exceeds 1024 UTF-8 bytes");
  }
  // SAFETY: Named Durable Objects use the canonical host key as their object
  // name; createEdgeHandler checks the channel pattern before obtaining a stub.
  // SAFETY: getByName receives this checked non-empty, byte-bounded object name as the opaque host key.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The Durable Object name is the canonical key established by edge routing.
  return name as HostKey;
}

/** Narrow a runtime WebSocket to Cloudflare's hibernatable socket extension. */
export function hibernatableSocket(socket: WebSocket): HibernatableSocket {
  if (
    !("deserializeAttachment" in socket) ||
    typeof socket.deserializeAttachment !== "function" ||
    !("serializeAttachment" in socket) ||
    typeof socket.serializeAttachment !== "function"
  ) {
    throw new TypeError("Cloudflare socket does not support serialized attachments");
  }
  return socket;
}

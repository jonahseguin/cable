import type { AnyChannelContract } from "@cablejs/contract";
import {
  createEngine,
  type ChannelImplementation,
  type EngineOptions,
  type GrantSecret,
  type HostLimits,
  type PeerMessage,
  type TimerPayloads,
} from "@cablejs/core";
import { DurableObject } from "cloudflare:workers";

import { CloudflareConnection, parseAttachment } from "./connection.js";
import { decodeGrantHeader } from "./grant-header.js";
import { CloudflareHost, hibernatableSocket, type CloudflarePeerResolver } from "./host.js";
import type { CableDurableObject } from "./runtime.js";

const GRANT_HEADER = "x-cable-grant";

/** Runtime configuration for a generated Cable Durable Object class. */
export interface CloudflareHostOptions<TEnv> {
  /** Core engine policy other than the environment-specific grant secret. */
  readonly engine?: Omit<EngineOptions, "grantSecret">;
  /** Read the HMAC secret synchronously from one Durable Object environment. */
  readonly grantSecret: (env: TEnv) => GrantSecret;
  /** Resolve any canonical target key to a Cable Durable Object RPC stub. */
  readonly peer: CloudflarePeerResolver<TEnv>;
}

/** @internal Runtime controls used by the workerd construction seam. */
export interface CloudflareRuntimeOptions<TEnv> extends CloudflareHostOptions<TEnv> {
  /** @internal Workerd conformance overrides portable byte limits. */
  readonly limits?: HostLimits;
  readonly now: () => number;
}

/**
 * Instance contract implemented by a class returned from {@link cloudflareHost}.
 *
 * Use this type for a `DurableObjectNamespace` binding when the generated class
 * needs its environment to refer back to that namespace.
 */
export type CloudflareHostInstance<TEnv> = CloudflareHostBase<TEnv>;

/** A Durable Object class generated for one channel contract. */
export type CloudflareDurableObjectClass<TEnv> = new (
  state: DurableObjectState,
  env: TEnv,
) => CloudflareHostBase<TEnv>;

/**
 * Base class implemented by a generated Cable Durable Object.
 *
 * Extend the class returned by {@link cloudflareHost} when the object needs
 * application RPC methods or additional Durable Object lifecycle behavior.
 * Cable owns `fetch`, hibernation callbacks, alarms, and the protected host
 * engine; subclasses must call `super` for any overridden lifecycle method.
 */
export abstract class CloudflareHostBase<TEnv>
  extends DurableObject<TEnv>
  implements CableDurableObject
{
  protected connection(_socket: WebSocket): CloudflareConnection {
    throw new Error("Cloudflare Host base cannot receive runtime callbacks.");
  }

  protected sockets(): WebSocket[] {
    throw new Error("Cloudflare Host base cannot inspect runtime sockets.");
  }

  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The Durable Object RPC result is parsed by its operation-specific caller.
  public __cable_peer(_message: PeerMessage): Promise<unknown> {
    throw new Error("Cloudflare Host base cannot receive peer calls.");
  }

  public override alarm(): Promise<void> {
    throw new Error("Cloudflare Host base cannot receive alarms.");
  }

  public override fetch(_request: Request): Promise<Response> {
    throw new Error("Cloudflare Host base cannot receive requests.");
  }

  public override webSocketClose(
    _socket: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    throw new Error("Cloudflare Host base cannot receive socket callbacks.");
  }

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Cloudflare supplies arbitrary callback errors to the core error boundary.
  public override webSocketError(_socket: WebSocket, _error: unknown): Promise<void> {
    throw new Error("Cloudflare Host base cannot receive socket callbacks.");
  }

  public override webSocketMessage(
    _socket: WebSocket,
    _message: string | ArrayBuffer,
  ): Promise<void> {
    throw new Error("Cloudflare Host base cannot receive socket callbacks.");
  }
}

/** @internal Construction seam used by the workerd adapter conformance suite. */
abstract class CloudflareHostTestBase<TEnv> extends CloudflareHostBase<TEnv> {
  protected readonly cableHost!: CloudflareHost<TEnv>;
}

/** @internal Class shape returned by the workerd-only construction seam. */
export type CloudflareHostTestClass<TEnv> = new (
  state: DurableObjectState,
  env: TEnv,
) => CloudflareHostTestBase<TEnv>;

/**
 * Create the Cloudflare Durable Object class for one channel family.
 *
 * The returned class uses hibernatable WebSockets and reconstructs all runtime
 * state from socket attachments, object storage, and the object name after a
 * wake. Export it directly from the Worker module and bind it with
 * `DurableObjectNamespace`.
 */
export function cloudflareHost<
  TChannel extends AnyChannelContract,
  TEnv,
  TIdentity,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
>(
  channel: TChannel,
  implementation: ChannelImplementation<TChannel, TIdentity, TTimerPayloads>,
  options: CloudflareHostOptions<TEnv>,
): CloudflareDurableObjectClass<TEnv> {
  return createCloudflareHostClass(channel, implementation, { ...options, now: Date.now });
}

/** @internal Workerd conformance uses this factory to control durable time. */
export function createCloudflareHostClass<
  TChannel extends AnyChannelContract,
  TEnv,
  TIdentity,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
>(
  channel: TChannel,
  implementation: ChannelImplementation<TChannel, TIdentity, TTimerPayloads>,
  options: CloudflareRuntimeOptions<TEnv>,
): CloudflareHostTestClass<TEnv> {
  return class CableCloudflareDurableObject extends CloudflareHostTestBase<TEnv> {
    declare protected readonly cableHost: CloudflareHost<TEnv>;
    private readonly handlers: ReturnType<typeof createEngine>;

    public constructor(state: DurableObjectState, env: TEnv) {
      super(state, env);
      this.cableHost = new CloudflareHost(state, env, options.peer, options.now, options.limits);
      this.cableHost.autoResponse("ping", "pong");
      this.handlers = createEngine(channel, implementation, this.cableHost, {
        ...options.engine,
        grantSecret: options.grantSecret(env),
      });
    }

    // oxlint-disable-next-line anti-slop/no-unknown-returns -- HostHandlers owns parsing the operation-specific peer response.
    public override __cable_peer(message: PeerMessage): Promise<unknown> {
      return this.handlers.onPeer(message);
    }

    public override alarm(): Promise<void> {
      return this.handlers.onAlarm();
    }

    public override async fetch(request: Request): Promise<Response> {
      if (
        request.method !== "GET" ||
        request.headers.get("upgrade")?.toLowerCase() !== "websocket"
      ) {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }
      const grant = decodeGrantHeader(request.headers.get(GRANT_HEADER));
      if (grant === undefined) {
        return new Response("Missing or malformed Cable grant", { status: 401 });
      }
      const result = await this.handlers.onUpgrade(stripPrivateHeaders(request), grant);
      if (!result.accept) return result.response;

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = hibernatableSocket(pair[1]);
      try {
        this.ctx.acceptWebSocket(server, [...result.tags]);
        server.serializeAttachment(result.attachment);
        return new Response(null, { status: 101, webSocket: client });
      } catch (error) {
        server.close(1011, "Socket setup failed");
        throw error;
      }
    }

    public override webSocketClose(
      socket: WebSocket,
      code: number,
      reason: string,
      wasClean: boolean,
    ): Promise<void> {
      if (!this.acceptedSocket(socket)) return Promise.resolve();
      return this.handlers.onClose(this.connection(socket), code, reason, wasClean);
    }

    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Cloudflare supplies arbitrary callback errors to the core error boundary.
    public override webSocketError(socket: WebSocket, error: unknown): Promise<void> {
      if (!this.acceptedSocket(socket)) return Promise.resolve();
      return this.handlers.onError(this.connection(socket), error);
    }

    public override webSocketMessage(
      socket: WebSocket,
      message: string | ArrayBuffer,
    ): Promise<void> {
      if (!this.acceptedSocket(socket)) return Promise.resolve();
      return this.handlers.onMessage(this.connection(socket), message);
    }

    private acceptedSocket(socket: WebSocket): boolean {
      try {
        return parseAttachment(hibernatableSocket(socket).deserializeAttachment()) !== undefined;
      } catch {
        return false;
      }
    }

    protected override sockets(): WebSocket[] {
      return this.ctx.getWebSockets();
    }

    /** @internal Test-only subclasses probe adapter connection limits. */
    protected override connection(socket: WebSocket): CloudflareConnection {
      return new CloudflareConnection(socket, this.ctx, this.cableHost.limits.attachmentBytes);
    }
  };
}

function stripPrivateHeaders(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete(GRANT_HEADER);
  headers.delete("authorization");
  headers.delete("cookie");
  return new Request(request, { headers });
}

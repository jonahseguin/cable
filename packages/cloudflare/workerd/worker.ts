import {
  CONFORMANCE_LIMITS,
  CONFORMANCE_POLICY,
  conformanceChannel,
  createConformanceImplementation,
} from "@cable/conformance";
import { c } from "@cable/contract";
import {
  CableError,
  implement,
  type HostLimits,
  type PeerMessage,
  type StorageListOptions,
} from "@cable/core";
import { z } from "zod";

import { createCloudflareHostClass } from "../src/cloudflare-host.js";
import { createHandler } from "../src/handler.js";
import type { CableDurableObjectNamespace, CableDurableObjectStub } from "../src/runtime.js";

interface ConformanceEnv {
  readonly CABLE_HOSTS: {
    getByName(name: string): CableDurableObjectStub;
  };
}

interface EdgeIdentity {
  readonly userId: string;
}

interface EdgeForwardingState {
  readonly authorization: string | null;
  readonly cableGrant: string | null;
  readonly cookie: string | null;
  readonly token: string | null;
}

/** Serializable result for one test-only Durable Object storage lookup. */
export interface ConformanceStorageValue {
  readonly found: boolean;
  readonly value?: unknown;
}

/** Serializable entry returned by the test-only Durable Object storage probe. */
export type ConformanceStorageEntry = readonly [string, unknown];

const grantSecret = "cloudflare-conformance-secret-material-32-bytes";
let nextConnectionId = 0;
let namedStubRequests = 0;
let lastForwarded: EdgeForwardingState | undefined;
const edgeApi = c.contract({
  probe: c.query({
    errors: { DENIED: z.object({ reason: z.string() }) },
    input: z.object({ value: z.string() }),
    output: z.object({ value: z.string() }),
  }),
  room: conformanceChannel,
});
const edgeProcedures = implement(edgeApi)
  .context<{ readonly identity: EdgeIdentity | null }>()
  .procedures({
    probe({ ctx, input }) {
      if (input.value === "deny") {
        throw new CableError("DENIED", { data: { reason: "fixture denial" } });
      }
      return { value: `${ctx.identity?.userId ?? "anonymous"}:${input.value}` };
    },
  });
const edgeHandler = createHandler(edgeApi, edgeProcedures, {
  authenticate(request, _env: ConformanceEnv): EdgeIdentity | null {
    return request.headers.get("authorization") === "Bearer edge-valid"
      ? { userId: "edge-user" }
      : null;
  },
  context({ identity }) {
    return { identity };
  },
  credentials: { mode: "bearer" },
  grantSecret: (_env: ConformanceEnv) => grantSecret,
  grants: () => ["connect"],
  hosts(env: ConformanceEnv) {
    return [{ channel: edgeApi.room, namespace: countedNamespace(env.CABLE_HOSTS) }];
  },
  uid: (identity) => identity.userId,
});
const BaseConformanceHost = createCloudflareHostClass(
  conformanceChannel,
  createConformanceImplementation(),
  {
    engine: {
      ...CONFORMANCE_POLICY,
      randomId: () => `${"\0".repeat(119)}${String(++nextConnectionId).padStart(8, "0")}`,
    },
    grantSecret: () => grantSecret,
    limits: CONFORMANCE_LIMITS,
    now: Date.now,
    peer: (env: ConformanceEnv, key) => env.CABLE_HOSTS.getByName(key),
  },
);

/** Durable Object used only by the real-workerd adapter conformance harness. */
export class ConformanceHost extends BaseConformanceHost {
  public async __cable_test_attachment_limit_probe(): Promise<string | null> {
    try {
      const socket = this.sockets().at(0);
      if (socket === undefined) return "Attachment probe requires an accepted socket.";
      const connection = this.connection(socket);
      const attachment = connection.attachment.get();
      if (attachment === undefined) return "Accepted socket has no Cable attachment.";
      connection.attachment.set({
        ...attachment,
        // SAFETY: This probe deliberately exceeds the adapter boundary; Attachment.set validates before persisting it.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The conformance probe only needs an oversized opaque grant identifier.
        grantId: "x".repeat(this.cableHost.limits.attachmentBytes) as typeof attachment.grantId,
      });
      return null;
    } catch {
      // Workerd RPC does not propagate a thrown Durable Object method error to
      // the caller reliably, so this test-only probe serializes its result.
      return "Connection attachment exceeds the configured byte limit.";
    }
  }

  public __cable_test_connection_count(): number {
    return this.sockets().length;
  }

  public __cable_test_key(): string {
    return this.cableHost.key;
  }

  public __cable_test_limits(): HostLimits {
    return this.cableHost.limits;
  }

  // oxlint-disable-next-line anti-slop/no-unknown-returns -- Peer results cross the Durable Object RPC boundary.
  public __cable_test_peer_call(message: PeerMessage): Promise<unknown> {
    // eslint-disable-next-line no-underscore-dangle -- The reserved Cable peer RPC is the direct same-object test seam.
    return this.__cable_peer(message);
  }

  public async __cable_test_peer_send(message: PeerMessage): Promise<void> {
    // eslint-disable-next-line no-underscore-dangle -- The reserved Cable peer RPC is the direct same-object test seam.
    await this.__cable_peer(message);
  }

  public async __cable_test_storage_get(key: string): Promise<ConformanceStorageValue> {
    const value = await this.cableHost.storage.get(key);
    return value === undefined ? { found: false } : { found: true, value };
  }

  public async __cable_test_storage_list(
    options: StorageListOptions,
  ): Promise<readonly ConformanceStorageEntry[]> {
    return [...(await this.cableHost.storage.list(options)).entries()];
  }
}

export default {
  fetch(request: Request, env: ConformanceEnv): Promise<Response> | Response {
    const url = new URL(request.url);
    if (url.pathname === "/__cable_test/edge-state") {
      return Response.json({ lastForwarded, namedStubRequests });
    }
    if (url.pathname === "/__cable_test/reset-edge-state" && request.method === "POST") {
      namedStubRequests = 0;
      lastForwarded = undefined;
      return new Response(null, { status: 204 });
    }
    return edgeHandler.fetch(request, env, undefined);
  },
};

function countedNamespace(namespace: CableDurableObjectNamespace): CableDurableObjectNamespace {
  return {
    getByName(name: string): CableDurableObjectStub {
      namedStubRequests += 1;
      const stub = namespace.getByName(name);
      return {
        // eslint-disable-next-line no-underscore-dangle -- The Cable peer RPC name is part of the adapter's fixed wire boundary.
        __cable_peer: (message) => stub.__cable_peer(message),
        fetch: async (request) => {
          const url = new URL(request.url);
          lastForwarded = {
            authorization: request.headers.get("authorization"),
            cableGrant: request.headers.get("x-cable-grant"),
            cookie: request.headers.get("cookie"),
            token: url.searchParams.get("token"),
          };
          return stub.fetch(request);
        },
      };
    },
  };
}

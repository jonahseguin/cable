import { c } from "@cablejs/contract";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { CableDiagnosticEvent } from "../diagnostics.js";
import type { HostKey, PeerMessage, SignedGrant } from "../host.js";
import { CableError, encodeBatch, implement, verifyGrant } from "../index.js";
import { createEdgeHandler } from "./handler.js";
import type { EdgeHostTransport } from "./types.js";

const secret = "edge-handler-test-secret-material-32-bytes";
const now = 1_800_000_000_000;

const channel = c.channel("room.{roomId}", {
  client: {},
  params: z.string().transform((value) => ({ roomId: value.toUpperCase() })),
  procedures: {
    inspect: c.query({ input: z.string(), output: z.string() }),
  },
  server: { changed: z.number() },
});

const contract = c.contract({ room: channel });
const procedures = implement(contract).context<{ readonly request: Request }>().procedures({});

class Transport implements EdgeHostTransport<undefined> {
  public readonly limits = { maxHostKeyBytes: 1_024, maxUidCharacters: 252 };
  public readonly peers: Array<{ key: string; message: unknown }> = [];
  public readonly upgrades: Array<{ key: HostKey; request: Request; grant: SignedGrant }> = [];
  public peerResult:
    | Error
    | { readonly seq: number }
    | { readonly d: string; readonly ok: true }
    | {
        readonly e: { readonly code: string; readonly data: { readonly reason: string } };
        readonly ok: false;
      } = {
    d: "ok",
    ok: true,
  };

  // oxlint-disable-next-line anti-slop/no-unknown-returns -- EdgeHostTransport models the adapter's untrusted peer RPC boundary.
  public async peer(key: HostKey, message: PeerMessage): Promise<unknown> {
    this.peers.push({ key, message });
    if (this.peerResult instanceof Error) throw this.peerResult;
    return this.peerResult;
  }

  public async upgrade(key: HostKey, request: Request, grant: SignedGrant): Promise<Response> {
    this.upgrades.push({ key, request, grant });
    return new Response(null, { status: 200 });
  }
}

interface UpgradeExecution {
  readonly requestId: string;
}

class VoidTransport implements EdgeHostTransport<UpgradeExecution, void> {
  public readonly limits = { maxHostKeyBytes: 1_024, maxUidCharacters: 252 };
  public execution: UpgradeExecution | undefined;

  // oxlint-disable-next-line anti-slop/no-unknown-returns -- EdgeHostTransport models the adapter's untrusted peer RPC boundary.
  public async peer(_key: HostKey, _message: PeerMessage): Promise<unknown> {
    return { d: "ok", ok: true };
  }

  public async upgrade(
    _key: HostKey,
    _request: Request,
    _grant: SignedGrant,
    execution: UpgradeExecution,
  ): Promise<void> {
    this.execution = execution;
  }
}

function handler(
  transport: Transport,
  options: {
    readonly authenticate?: () => { readonly userId: string } | null;
    readonly diagnostics?: (event: CableDiagnosticEvent) => void;
  } = {},
) {
  let grantSecrets = 0;
  const edgeOptions = {
    authenticate: () =>
      options.authenticate === undefined ? { userId: "user-1" } : options.authenticate(),
    context: ({ request }: { readonly request: Request }) => ({ request }),
    credentials: { mode: "cookie" as const, origins: ["https://app.example.com"] },
    grantSecret: () => {
      grantSecrets += 1;
      return secret;
    },
    grants: () => ["connect"],
    hosts: () => [{ channel, transport }],
    now: () => now,
  };
  if (options.diagnostics !== undefined)
    Object.assign(edgeOptions, { diagnostics: { observe: options.diagnostics } });
  const edge = createEdgeHandler(contract, procedures, edgeOptions);
  return { edge, grantSecrets: () => grantSecrets };
}

function upgrade(url: string, headers: HeadersInit = {}): Request {
  const requestHeaders = new Headers({ origin: "https://app.example.com", upgrade: "websocket" });
  for (const [name, value] of new Headers(headers)) requestHeaders.set(name, value);
  return new Request(url, {
    headers: requestHeaders,
  });
}

function hostCallRequest(): Request {
  return new Request("https://example.test/_cable/host/room%3ALOBBY/inspect", {
    body: JSON.stringify({ input: "value", params: "lobby" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("portable edge handler", () => {
  it("passes the incoming HTTP signal through the public edge RPC route", async () => {
    const rpcContract = c.contract({ ping: c.query({ input: z.void(), output: z.string() }) });
    let observedSignal: AbortSignal | undefined;
    const rpcProcedures = implement(rpcContract)
      .context<Record<never, never>>()
      .procedures({
        ping: ({ signal }) => {
          observedSignal = signal;
          return "pong";
        },
      });
    const edge = createEdgeHandler(rpcContract, rpcProcedures, {
      authenticate: () => ({ userId: "user-1" }),
      context: () => ({}),
      credentials: { mode: "bearer" },
      grantSecret: () => secret,
      hosts: () => [],
    });
    const response = await edge.fetch(
      new Request("https://example.test/_cable/rpc", {
        body: encodeBatch({ calls: [{ id: "ping", input: undefined, path: "ping" }] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      undefined,
      undefined,
    );
    expect(response.status).toBe(200);
    expect(observedSignal).toBeInstanceOf(AbortSignal);
    expect(observedSignal?.aborted).toBe(false);
  });

  it("authenticates and creates context once before dispatching a matching HTTP mount", async () => {
    const routeContract = c.contract({ ping: c.query({ input: z.void(), output: z.string() }) });
    const routeProcedures = implement(routeContract)
      .context<{ readonly request: Request }>()
      .procedures({ ping: () => "pong" });
    let authenticated = 0;
    let contexts = 0;
    let mounted = 0;
    const edge = createEdgeHandler(
      routeContract,
      routeProcedures,
      {
        authenticate: () => {
          authenticated += 1;
          return { userId: "user-1" };
        },
        context: ({ request }) => {
          contexts += 1;
          return { request };
        },
        credentials: { mode: "bearer" },
        grantSecret: () => secret,
        hosts: () => [],
      },
      {
        fetch: async (
          _request: Request,
          context: { readonly request: Request },
          policy: { readonly maxBodyBytes: number },
        ) => {
          mounted += 1;
          expect(context.request.url).toBe("https://example.test/posts");
          expect(policy.maxBodyBytes).toBe(1_048_576);
          return new Response("mounted", { status: 201 });
        },
        matches: (request: Request) => new URL(request.url).pathname === "/posts",
      },
    );

    const response = await edge.fetch(
      new Request("https://example.test/posts"),
      undefined,
      undefined,
    );

    expect(response.status).toBe(201);
    expect(authenticated).toBe(1);
    expect(contexts).toBe(1);
    expect(mounted).toBe(1);
  });

  it("creates a typed trusted host facade with canonical keys and grants", async () => {
    const transport = new Transport();
    transport.peerResult = { seq: 1 };
    const { edge } = handler(transport);
    const hosts = edge.hosts({
      env: {},
      principal: { identity: { userId: "trusted" }, uid: "trusted" },
    });

    await expect(hosts.room("lobby").emit("changed", 7)).resolves.toBe(1);
    expect(transport.peers).toEqual([
      {
        key: "room:LOBBY",
        message: {
          d: 7,
          ev: "changed",
          grants: ["connect"],
          identity: { userId: "trusted" },
          t: "emit",
          uid: "trusted",
        },
      },
    ]);
  });

  it("requires an authenticated principal before pushing an event", async () => {
    const transport = new Transport();
    const { edge } = handler(transport);
    const unauthenticated = edge.hosts({ env: {}, principal: { identity: null } });

    await expect(unauthenticated.room("lobby").emit("changed", 7)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    expect(transport.peers).toHaveLength(0);
  });

  it("applies the configured grant policy to server-side pushes", async () => {
    const transport = new Transport();
    transport.peerResult = { seq: 1 };
    const denied = createEdgeHandler(contract, procedures, {
      authenticate: () => ({ userId: "user-1" }),
      context: ({ request }) => ({ request }),
      credentials: { mode: "bearer" },
      grantSecret: () => secret,
      grants: () => {
        throw new CableError("FORBIDDEN");
      },
      hosts: () => [{ channel, transport }],
      now: () => now,
    });

    const hosts = denied.hosts({
      env: {},
      principal: { identity: { userId: "trusted" } },
    });
    await expect(hosts.room("lobby").emit("changed", 7)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(transport.peers).toHaveLength(0);
  });

  it("forwards adapter execution and allows an upgrade to complete without a Response", async () => {
    const transport = new VoidTransport();
    const edge = createEdgeHandler(contract, procedures, {
      authenticate: () => ({ userId: "user-1" }),
      context: ({ request }) => ({ request }),
      credentials: { mode: "bearer" },
      grantSecret: () => secret,
      hosts: () => [{ channel, transport }],
      now: () => now,
    });

    await expect(
      edge.fetch(
        upgrade("https://example.test/_cable/ws?ch=room%3ALOBBY&params=%22lobby%22"),
        {},
        { requestId: "upgrade-1" },
      ),
    ).resolves.toBeUndefined();
    expect(transport.execution).toEqual({ requestId: "upgrade-1" });
  });

  it("rejects unauthenticated, malformed, cross-origin, and non-JSON requests before grants or transport", async () => {
    const transport = new Transport();
    const { edge, grantSecrets } = handler(transport, { authenticate: () => null });
    const valid = "https://example.test/_cable/ws?ch=room%3ALOBBY&params=%22lobby%22";
    const requests = [
      upgrade(valid),
      upgrade("https://example.test/_cable/ws?ch=room%3ALOBBY&params=%7B"),
      upgrade(valid, { origin: "https://other.example.com" }),
      new Request("https://example.test/_cable/host/room%3ALOBBY/inspect", {
        body: JSON.stringify({ input: "value", params: "lobby" }),
        method: "POST",
      }),
    ];

    const responses = await Promise.all(
      requests.map((request) => edge.fetch(request, {}, undefined)),
    );
    expect(responses.map((response) => response.status)).toEqual([401, 400, 403, 400]);
    expect(grantSecrets()).toBe(0);
    expect(transport.upgrades).toHaveLength(0);
    expect(transport.peers).toHaveLength(0);
  });

  it("parses transformed parameters once, signs their canonical key, and strips caller credentials", async () => {
    const transport = new Transport();
    let validations = 0;
    const transformed = c.channel("counted.{roomId}", {
      client: {},
      params: z.string().transform((value) => {
        validations += 1;
        return { roomId: value.toUpperCase() };
      }),
      server: {},
    });
    const transformedContract = c.contract({ transformed });
    const transformedProcedures = implement(transformedContract)
      .context<{ readonly request: Request }>()
      .procedures({});
    const errors: unknown[] = [];
    const transformedEdge = createEdgeHandler(transformedContract, transformedProcedures, {
      authenticate: () => ({ userId: "user-1" }),
      context: ({ request }) => ({ request }),
      credentials: { mode: "bearer" },
      grantSecret: () => secret,
      hosts: () => [{ channel: transformed, transport }],
      now: () => now,
      onError: (error) => {
        errors.push(error);
      },
    });

    const response = await transformedEdge.fetch(
      upgrade(
        "https://example.test/_cable/ws?ch=counted%3ALOBBY&params=%22lobby%22&token=browser-token",
        {
          authorization: "Bearer caller-token",
          cookie: "session=caller",
          "x-cable-grant": "caller-controlled",
        },
      ),
      {},
      undefined,
    );

    expect(errors).toEqual([]);
    expect(response.status).toBe(200);
    expect(validations).toBe(1);
    expect(transport.upgrades).toHaveLength(1);
    const forwarded = transport.upgrades[0];
    if (forwarded === undefined) throw new Error("Expected one forwarded upgrade.");
    expect(forwarded.key).toBe("counted:LOBBY");
    expect(forwarded.request.url).not.toContain("token=");
    expect(forwarded.request.headers.get("authorization")).toBeNull();
    expect(forwarded.request.headers.get("cookie")).toBeNull();
    expect(forwarded.request.headers.get("x-cable-grant")).toBeNull();
    await expect(verifyGrant(forwarded.grant, secret, forwarded.key, now)).resolves.toMatchObject({
      hostKey: "counted:LOBBY",
      params: { roomId: "LOBBY" },
    });
  });

  it("returns host fallback success, declared peer errors, and unavailable transport errors", async () => {
    const transport = new Transport();
    const { edge } = handler(transport);
    await expect(edge.fetch(hostCallRequest(), {}, undefined)).resolves.toMatchObject({
      status: 200,
    });
    expect(
      await edge.fetch(hostCallRequest(), {}, undefined).then((response) => response.json()),
    ).toEqual({
      data: "ok",
      id: "host",
      ok: true,
    });

    transport.peerResult = { e: { code: "DENIED", data: { reason: "policy" } }, ok: false };
    const declared = await edge.fetch(hostCallRequest(), {}, undefined);
    expect(declared.status).toBe(400);
    await expect(declared.json()).resolves.toEqual({
      error: { code: "DENIED", data: { reason: "policy" }, message: "denied", status: 400 },
      id: "host",
      ok: false,
    });

    transport.peerResult = new Error("network down");
    const unavailable = await edge.fetch(hostCallRequest(), {}, undefined);
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: { code: "UNAVAILABLE", message: "Host peer request failed", status: 503 },
      id: "host",
      ok: false,
    });
    expect(transport.peers).toHaveLength(4);
  });

  it("does not expose an unknown host procedure route through diagnostics", async () => {
    const transport = new Transport();
    const diagnostics: unknown[] = [];
    transport.peerResult = new Error("network down");
    const { edge } = handler(transport, { diagnostics: (event) => diagnostics.push(event) });
    const response = await edge.fetch(
      new Request("https://example.test/_cable/host/room%3ALOBBY/private-route-secret", {
        body: JSON.stringify({ input: "private-input-secret", params: "lobby" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      {},
      undefined,
    );

    expect(response.status).toBe(404);
    expect(diagnostics).toEqual([
      expect.objectContaining({ operation: "host procedure", type: "fault" }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("private-route-secret");
    expect(JSON.stringify(diagnostics)).not.toContain("private-input-secret");
  });
});

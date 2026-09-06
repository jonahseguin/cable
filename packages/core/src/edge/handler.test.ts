import { c } from "@cable/contract";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { HostKey, PeerMessage, SignedGrant } from "../host.js";
import { implement, verifyGrant } from "../index.js";
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
  options: { readonly authenticate?: () => { readonly userId: string } | null } = {},
) {
  let grantSecrets = 0;
  const edge = createEdgeHandler(contract, procedures, {
    authenticate: () =>
      options.authenticate === undefined ? { userId: "user-1" } : options.authenticate(),
    context: ({ request }) => ({ request }),
    credentials: { mode: "cookie", origins: ["https://app.example.com"] },
    grantSecret: () => {
      grantSecrets += 1;
      return secret;
    },
    grants: () => ["connect"],
    hosts: () => [{ channel, transport }],
    now: () => now,
  });
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
});

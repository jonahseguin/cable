import { Agent, createServer, request as httpRequest, type Server } from "node:http";

import { c } from "@cablejs/contract";
import { encodeBatch, implement } from "@cablejs/core";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createHandler, type NodeHandler } from "./index.js";

const secret = "01234567890123456789012345678901";
const contract = c.contract({ echo: c.mutation({ input: z.string(), output: z.string() }) });
let observedSignal: AbortSignal | undefined;
const procedures = implement(contract)
  .context<{ readonly request: Request }>()
  .procedures({
    echo: async ({ input, signal }) => {
      if (input === "wait") {
        observedSignal = signal;
        await new Promise<void>((resolve) => {
          signal?.addEventListener("abort", () => resolve(), { once: true });
        });
        return "aborted";
      }
      return input.toUpperCase();
    },
  });

let server: Server | undefined;
let handler: NodeHandler | undefined;
let agent: Agent | undefined;

afterEach(async () => {
  await handler?.shutdown();
  handler = undefined;
  if (server !== undefined) await close(server);
  server = undefined;
  agent?.destroy();
  agent = undefined;
  observedSignal = undefined;
});

describe("Node handler", () => {
  it("converts an IncomingMessage into one portable RPC response", async () => {
    handler = createHandler(contract, procedures, {
      authenticate: () => ({ userId: "user-1" }),
      context: ({ request }) => ({ request }),
      credentials: { mode: "bearer" },
      grantSecret: secret,
      hosts: [],
    });
    server = createServer((request, response) => {
      void handler?.request(request, response).catch(() => response.destroy());
    });
    const address = await listen(server);

    const response = await fetch(`${address}/_cable/rpc`, {
      body: encodeBatch({ calls: [{ id: "echo", input: "hello", path: "echo" }] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [{ data: "HELLO", id: "echo", ok: true }],
    });
  });

  it("propagates a client disconnect to the procedure signal", async () => {
    handler = createHandler(contract, procedures, {
      authenticate: () => ({ userId: "user-1" }),
      context: ({ request }) => ({ request }),
      credentials: { mode: "bearer" },
      grantSecret: secret,
      hosts: [],
    });
    server = createServer((request, response) => {
      void handler?.request(request, response).catch(() => response.destroy());
    });
    const address = await listen(server);
    const controller = new AbortController();
    const request = fetch(`${address}/_cable/rpc`, {
      body: encodeBatch({ calls: [{ id: "echo", input: "wait", path: "echo" }] }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });

    await waitFor(() => observedSignal !== undefined);
    controller.abort();
    await expect(request).rejects.toThrow("aborted");
    await waitFor(() => observedSignal?.aborted === true);
    expect(observedSignal?.aborted).toBe(true);
  });

  it("cleans request listeners across sequential keep-alive requests", async () => {
    handler = createHandler(contract, procedures, {
      authenticate: () => ({ userId: "user-1" }),
      context: ({ request }) => ({ request }),
      credentials: { mode: "bearer" },
      grantSecret: secret,
      hosts: [],
    });
    server = createServer((request, response) => {
      void handler?.request(request, response).catch(() => response.destroy());
    });
    const address = await listen(server);
    agent = new Agent({ keepAlive: true });
    await expect(postWithAgent(address, agent)).resolves.toBe("HELLO");
    await expect(postWithAgent(address, agent)).resolves.toBe("HELLO");
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started >= 500) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for Node request state."));
      }
    }, 5);
  });
}

function postWithAgent(address: string, requestAgent: Agent): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      `${address}/_cable/rpc`,
      {
        agent: requestAgent,
        headers: { "content-type": "application/json", connection: "keep-alive" },
        method: "POST",
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          let body: unknown;
          try {
            // SAFETY: JSON.parse is narrowed by isRpcEnvelope immediately before use.
            body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
          } catch (error) {
            reject(error);
            return;
          }
          if (!isRpcEnvelope(body)) {
            reject(new Error("Expected an RPC response envelope."));
            return;
          }
          resolve(body.results[0]?.data ?? "");
        });
      },
    );
    request.on("error", reject);
    request.end(encodeBatch({ calls: [{ id: "echo", input: "hello", path: "echo" }] }));
  });
}

function isRpcEnvelope(value: unknown): value is {
  readonly results: Array<{ readonly data?: string }>;
} {
  if (typeof value !== "object" || value === null) return false;
  return Array.isArray(Object.getOwnPropertyDescriptor(value, "results")?.value);
}

function listen(serverToListen: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    serverToListen.once("error", reject);
    serverToListen.listen(0, "127.0.0.1", () => {
      serverToListen.off("error", reject);
      const address = serverToListen.address();
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Node's listener API returns a documented string-or-address union.
      if (address === null || typeof address === "string") {
        reject(new Error("Expected a TCP listener address."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(serverToClose: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    serverToClose.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

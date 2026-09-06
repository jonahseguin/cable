import { createServer, type Server } from "node:http";

import { c } from "@cable/contract";
import { encodeBatch, implement } from "@cable/core";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createHandler, type NodeHandler } from "./index.js";

const secret = "01234567890123456789012345678901";
const contract = c.contract({ echo: c.mutation({ input: z.string(), output: z.string() }) });
const procedures = implement(contract)
  .context<{ readonly request: Request }>()
  .procedures({ echo: ({ input }) => input.toUpperCase() });

let server: Server | undefined;
let handler: NodeHandler | undefined;

afterEach(async () => {
  await handler?.shutdown();
  handler = undefined;
  if (server !== undefined) await close(server);
  server = undefined;
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
});

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

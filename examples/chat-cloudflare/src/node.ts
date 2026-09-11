// fallow-ignore-file unused-file -- This is the Bun-built Node server entry used by dev:node and the Node integration smoke.
import { createServer } from "node:http";

import { createHandler, nodeHost } from "@cablejs/adapter-node";
import { createRestHandler } from "@cablejs/openapi";

import { api } from "./api.js";
import { chatImplementation, identityFromRequest, procedures } from "./chat-server.js";

const port = Number.parseInt(process.env["PORT"] ?? "8789", 10);
const secret = process.env["CABLE_GRANT_SECRET"];
if (secret === undefined) throw new Error("CABLE_GRANT_SECRET is required.");

const handler = createHandler(api, procedures, {
  authenticate: identityFromRequest,
  context: ({ hosts, identity }) => ({ chat: hosts.chat, identity }),
  credentials: { mode: "bearer" },
  grantSecret: secret,
  grants: () => ["chat"],
  hosts: [nodeHost(api.chat, chatImplementation)],
  mount: createRestHandler(api, procedures),
  uid: (identity) => identity.userId,
});
const server = createServer((request, response) => {
  void handler.request(request, response).catch(() => response.destroy());
});
server.on("upgrade", (request, socket, head) => {
  void handler.upgrade(request, socket, head).catch(() => socket.destroy());
});
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Cable Node chat listening on ${String(port)}.\n`);
});
async function shutdown(): Promise<void> {
  await handler.shutdown();
  server.close();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

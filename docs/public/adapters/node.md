---
title: Node and Bun
description: Run Cable's in-memory Node host behind a Node HTTP server and native WebSocket upgrades.
---

`@cable/adapter-node` is a local Node host. It keeps channel state in process memory, so restarting the process drops sockets, presence, history, and application storage.

```ts
import { createServer } from "node:http";
import { createHandler, nodeHost } from "@cable/adapter-node";

const handler = createHandler(api, procedures, {
  authenticate: identityFromRequest,
  context: ({ identity }) => ({ identity }),
  credentials: { mode: "bearer" },
  grantSecret: process.env.CABLE_GRANT_SECRET!,
  grants: () => ["chat"],
  hosts: [nodeHost(api.chat, chatImplementation)],
  uid: (identity) => identity.userId,
});

const server = createServer((request, response) => {
  void handler.request(request, response).catch(() => response.destroy());
});
server.on("upgrade", (request, socket, head) => {
  void handler.upgrade(request, socket, head).catch(() => socket.destroy());
});
server.listen(8789, "127.0.0.1");
```

Use a real secret, including in local development. The Node handler uses the same edge authentication, grant signing, channel authorization, and wire protocol as other adapters.

Call `await handler.shutdown()` during server shutdown. It waits for tracked host work and closes the WebSocket server. The adapter relies on Node's `http` server and its `upgrade` event; Bun can run this entry after building it for Node compatibility, as the chat example does. It does not provide a `Bun.serve` handler.

# @cable/adapter-node

`@cable/adapter-node` runs Cable procedures and channel hosts in one local Node
process. It stores channel state in memory. Restarting the process discards that
state, so use this adapter for development and local tests.

```ts
import { createHandler, nodeHost } from "@cable/adapter-node";
import { createServer } from "node:http";

const secret = process.env.CABLE_GRANT_SECRET;
if (secret === undefined) throw new Error("CABLE_GRANT_SECRET is required.");

const handler = createHandler(api, procedures, {
  authenticate: authenticateRequest,
  context: ({ identity }) => ({ identity }),
  credentials: { mode: "bearer" },
  grantSecret: secret,
  hosts: [nodeHost(api.chat, chatImplementation)],
  grants: () => ["chat"],
  uid: (identity) => identity.userId,
});

const server = createServer((request, response) => {
  void handler.request(request, response);
});
server.on("upgrade", (request, socket, head) => {
  void handler.upgrade(request, socket, head);
});
server.listen(8789);
```

`request` handles Cable HTTP routes. `upgrade` accepts native WebSocket
upgrades. Call `handler.shutdown()` before closing the HTTP server so active
sockets close and pending adapter work finishes. Each handler owns its registry
and in-memory storage. Idle engines are evicted after five minutes while that
handler remains alive; their storage and scheduled work remain available.

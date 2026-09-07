---
title: Use the client
description: Call Cable procedures and manage typed channels with batched HTTP, reconnecting sockets, presence, durable replay, and explicit resource ownership.
---

`@cable/client` imports the shared contract type and calls procedures through HTTP batches or an in-process link. It does not import server types.

```ts
import { createClient } from "@cable/client";
import type { Api } from "./contract.js";

const client = createClient<Api>({
  url: "https://api.example.com/_cable",
  auth: { token: () => sessionStorage.getItem("token") ?? undefined },
});

const posts = await client.posts.list.query({});
await client.posts.create.mutate({ title: "A new post" });
```

Concurrent procedure calls share a POST batch. The default batch has a limit of 20 requests or 10 milliseconds. `batchLink({ maxBatch, maxWait })` changes those limits.

## Enable channels

Pass the runtime contract when the client uses channels. A channel handle opens its socket when the application subscribes, sends an event, or updates presence.

```ts
import { api } from "./contract.js";

const client = createClient({ contract: api, url: "/_cable" });
const room = client.chat({ roomId: "general" });
const off = room.on("message", (message) => console.log(message));

await room.send({ text: "Hello" }, { ack: true });
room.presence.update({ typing: true });

off();
room.dispose();
```

Handles for the same canonical channel key share one connection within a client. Dispose each handle when the application no longer needs it. The final release closes the socket after 30 seconds by default; configure the delay with `ws.idleClose`.

## Reconnect and history

Reconnect uses exponential backoff. Cable resumes from the last delivered event and waits for the final welcome chunk before reporting `open`. A retained-history gap emits `reset`. Optional `ws.cursors` persists sequence cursors through a sessionStorage-compatible store.

Acknowledged channel events and host calls reject when their connection is interrupted. Cable does not repeat them automatically.

Next, [connect the client to Cloudflare](/adapters/cloudflare).

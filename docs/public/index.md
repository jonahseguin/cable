---
title: Welcome
description: Type-safe RPC and durable realtime channels for TypeScript, with presence, permissions, and replay built in.
---

Define the contract once. The server and client use the same types for RPC and realtime events.

```ts title="api.ts"
import { c } from "@cablejs/contract";
import { z } from "zod";

export const api = c.contract({
  profile: c.query({
    input: z.object({ userId: z.string() }),
    output: z.object({ name: z.string() }),
  }),
  chat: c.channel("chat.{roomId}", {
    server: { message: z.object({ author: z.string(), text: z.string() }) },
    client: { send: z.object({ text: z.string().min(1) }) },
  }),
});
```

```ts title="client.ts"
import { createClient } from "@cablejs/client";
import { api } from "./api.js";

const client = createClient({ contract: api, url: "/_cable" });
const profile = await client.profile.query({ userId: "user-1" });
const room = client.chat({ roomId: "general" });
room.on("message", (message) => console.log(message.author, message.text));
await room.send({ text: `Hello from ${profile.name}` }, { ack: true });
```

The complete server setup, including the handler and channel host, is in [Get started](/getting-started). The [Cloudflare adapter guide](/adapters/cloudflare) covers deployment and bindings.

## Start here

- [Get started](/getting-started) follows one contract from server handler to client call.
- [How cable fits together](/architecture) explains contracts, runtimes, hosts, and clients.
- [Examples](/examples) points to the runnable chat application and its source files.
- [Define a contract](/contracts) describes global procedures and channel families.
- [Implement procedures](/procedures) connects global procedures to server code.
- [Use the client](/client) calls procedures and opens typed channel handles.

## Choose your next guide

- [Authorization](/authorization) shows context refinement with public, protected, and admin procedures.
- [React](/react) adds cable to a React component tree.
- [Channels](/channels) explains channel keys, events, presence, and history.
- [Cloudflare Durable Objects](/adapters/cloudflare) runs one channel host per Durable Object.

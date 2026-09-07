---
title: Welcome
description: End-to-end type safety for APIs and realtime.
---

Define the contract once. Implement it on the server. Call procedures and exchange typed events from the client.

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

The server fills in the global procedure and channel behavior separately. The
same `api` value keeps both implementations tied to the contract.

```ts title="server.ts"
import { type ChannelImplementation, implement } from "@cablejs/core";
import { api } from "./api.js";

export const procedures = implement(api)
  .context<{ readonly userId: string }>()
  .procedures({
    profile: ({ ctx, input }) => ({
      name: input.userId === ctx.userId ? "Mina" : "Guest",
    }),
  });

export const chatImplementation = {
  onClient: {
    async send(context, { text }) {
      await context.emit("message", { author: context.identity.userId, text });
    },
  },
  procedures: {},
} satisfies ChannelImplementation<typeof api.chat, { userId: string }>;
```

The client uses the same contract for procedure inputs, channel parameters, and
event payloads.

```ts title="client.ts"
import { createClient } from "@cablejs/client";
import { api } from "./api.js";

const client = createClient({ contract: api, url: "/_cable" });
const profile = await client.profile.query({ userId: "user-1" });

const room = client.chat({ roomId: "general" });
const unsubscribe = room.on("message", (message) => console.log(message.author, message.text));
await room.send({ text: `Hello from ${profile.name}` }, { ack: true });

unsubscribe();
room.dispose();
```

The same contract gives the server and client their types. Add a channel when
the feature needs ordered events, presence, history, or state owned by one
durable host.

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

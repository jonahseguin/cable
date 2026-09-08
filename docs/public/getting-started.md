---
title: Get started
description: Define one contract, run typed RPC and realtime events, and call both from the client.
---

This example uses the Cloudflare adapter because a channel needs a host. It keeps the contract, Worker, and client code small enough to follow in one sitting. For Wrangler bindings and deployment, see the [Cloudflare adapter guide](/adapters/cloudflare).

## Define the contract

Put this shared module where both the Worker and browser can import it.

```ts title="api.ts"
import { c } from "@cablejs/contract";
import { z } from "zod";

export const api = c.contract({
  greeting: c.query({
    input: z.object({ name: z.string().min(1) }),
    output: z.object({ message: z.string() }),
  }),
  chat: c.channel("chat.{roomId}", {
    client: { send: z.object({ text: z.string().trim().min(1) }) },
    server: { message: z.object({ text: z.string(), user: z.string() }) },
  }),
});
```

The RPC and channel event schemas are part of the same `api` value. The client and server now infer their inputs and outputs from it.

## Implement the Worker

Implement the RPC and channel behavior, then register the channel host with the edge handler. The `identityFromRequest` function below is an application boundary. Replace its bearer-token example with your session or token verification.

```ts title="worker.ts"
import { cloudflareHost, createHandler, type CloudflareHostInstance } from "@cablejs/cloudflare";
import { CableError, implement } from "@cablejs/core";
import type { ChannelImplementation } from "@cablejs/core";

import { api } from "./api.js";

interface Identity {
  readonly userId: string;
  readonly name: string;
}

interface Env {
  readonly CHAT: DurableObjectNamespace<CloudflareHostInstance<Env>>;
  readonly CABLE_GRANT_SECRET: string;
}

const chatImplementation = {
  authorize(context) {
    if (!context.grants.includes("chat")) throw new CableError("FORBIDDEN");
  },
  onClient: {
    async send(context, input) {
      await context.emit("message", { text: input.text, user: context.identity.name });
    },
  },
  procedures: {},
} satisfies ChannelImplementation<typeof api.chat, Identity>;

const procedures = implement(api)
  .context<{ readonly identity: Identity | null }>()
  .procedures({
    greeting: ({ ctx, input }) => ({
      message: `Hello, ${input.name} from ${ctx.identity?.name ?? "guest"}`,
    }),
  });

const ChatHostClass = cloudflareHost(api.chat, chatImplementation, {
  grantSecret: (env: Env) => env.CABLE_GRANT_SECRET,
  peer: (env: Env, key) => env.CHAT.getByName(key),
});

export class ChatHost extends ChatHostClass {}

const handler = createHandler(api, procedures, {
  authenticate: (request) => identityFromRequest(request),
  context: ({ identity }) => ({ identity }),
  credentials: { mode: "bearer" },
  grantSecret: (env: Env) => env.CABLE_GRANT_SECRET,
  grants: () => ["chat"],
  hosts: (env: Env) => [{ channel: api.chat, namespace: env.CHAT }],
  uid: (identity) => identity.userId,
});

export default handler satisfies ExportedHandler<Env>;

function identityFromRequest(request: Request): Identity | null {
  const value = request.headers.get("authorization");
  if (value?.startsWith("Bearer ") !== true) return null;
  const name = value.slice("Bearer ".length).trim();
  return name.length === 0 ? null : { name, userId: name };
}
```

`CABLE_GRANT_SECRET` must be available to both `cloudflareHost` and `createHandler`. The Durable Object binding name and migration must match the exported `ChatHost` class. Keep application authentication in `authenticate`; the channel's `authorize` hook still checks the grants received by the host.

## Call RPC and open a channel

The client uses the same contract for the greeting input, channel parameters, and event payloads.

```ts title="client.ts"
import { createClient } from "@cablejs/client";

import { api } from "./api.js";

const client = createClient({
  auth: { token: () => "demo-user" },
  contract: api,
  url: "/_cable",
});

const greeting = await client.greeting.query({ name: "Mina" });
console.log(greeting.message);

const room = client.chat({ roomId: "general" });
const unsubscribe = room.on("message", (message) => {
  console.log(`${message.user}: ${message.text}`);
});
await room.send({ text: "Hello from the browser" }, { ack: true });

unsubscribe();
room.dispose();
```

The client validates the event payload against `api.chat.server.message`, and `room.send` uses `api.chat.client.send`. Add presence, history, or channel procedures to the contract when the room needs them. Next, read [Define contracts](/contracts), [Authorize procedures](/authorization), or the [Cloudflare adapter guide](/adapters/cloudflare).

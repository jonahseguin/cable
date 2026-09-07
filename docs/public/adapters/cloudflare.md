---
title: Cloudflare Durable Objects
description: Run each Cable channel host in a Cloudflare Durable Object with hibernatable WebSockets, durable storage, edge authentication, and signed private grants.
---

`@cable/cloudflare` runs one Cable channel host in a Durable Object. Export the generated class from the Worker module, bind its class name in Wrangler, and register that namespace in the edge handler.

```ts
import { cloudflareHost, createHandler, type CloudflareHostInstance } from "@cable/cloudflare";

interface Env {
  readonly CHAT_HOSTS: DurableObjectNamespace<CloudflareHostInstance<Env>>;
  readonly CABLE_GRANT_SECRET: string;
}

export const ChatHost = cloudflareHost(api.chat, chatImplementation, {
  grantSecret: (env: Env) => env.CABLE_GRANT_SECRET,
  peer: (env: Env, key) => env.CHAT_HOSTS.getByName(key),
});

const handler = createHandler(api, procedures, {
  authenticate: (request, env) => authenticate(request, env),
  context: ({ identity, hosts }) => ({ identity, hosts }),
  credentials: { mode: "bearer" },
  grantSecret: (env) => env.CABLE_GRANT_SECRET,
  grants: (identity) => grantsFor(identity),
  hosts: (env) => [{ channel: api.chat, namespace: env.CHAT_HOSTS }],
  uid: (identity) => identity.userId,
});

export default { fetch: handler.fetch };
```

```jsonc
{
  "durable_objects": { "bindings": [{ "name": "CHAT_HOSTS", "class_name": "ChatHost" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["ChatHost"] }],
}
```

`class_name` must equal the exported class name. Add a migration when introducing a class. Do not rename or remove a deployed class without Cloudflare's migration process.

## Request flow

The edge handler authenticates RPC, host-fallback, and WebSocket requests. For an accepted upgrade, it strips caller credentials, signs a private grant, and forwards the request to the Durable Object named for the channel key. The host verifies that grant before accepting the socket. `grantSecret` must return the same secret in both places.

In cookie mode, set `credentials: { mode: "cookie", origins: ["https://app.example.com"] }` and authenticate the session cookie. In bearer mode, set `credentials: { mode: "bearer" }` and validate the Authorization header or browser token. `grants` derives short-lived channel capabilities. It does not replace a channel's `authorize` check.

The adapter uses hibernatable WebSockets, serialized attachments, Durable Object storage and alarms, and RPC for peer calls. Keep application state in `context.storage`, not object fields, because hibernation creates a new engine instance.

## Run the example

The local example needs both the Worker and Vite processes. Create the Worker secret and start Wrangler in one terminal:

```bash
(cd examples/chat-cloudflare && cp .dev.vars.example .dev.vars)
(cd examples/chat-cloudflare && bunx wrangler dev --local)
```

Set `CABLE_GRANT_SECRET` in `examples/chat-cloudflare/.dev.vars` to at least 32 random characters. Then start Vite in a second terminal:

```bash
bun --filter @cable/example-chat-cloudflare dev
```

The local browser identity is only a development bearer token. Replace it with application authentication before deployment. The contract, Worker, and client code live in `examples/chat-cloudflare/src/`.

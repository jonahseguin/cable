---
title: Examples
description: Follow the runnable Cloudflare chat application from shared contract to server host and React client.
---

The [Cloudflare chat example](https://github.com/jonahseguin/cable/tree/main/examples/chat-cloudflare) is a runnable application. It includes authenticated REST procedures, `/openapi.json`, a Hono notification route that emits to a channel, global session procedures, retained history, presence, and a React client.

Read the files in this order:

1. [`src/api.ts`](https://github.com/jonahseguin/cable/blob/main/examples/chat-cloudflare/src/api.ts) declares the REST metadata, `session.whoami`, and the `chat.{roomId}` channel.
2. [`src/chat-server.ts`](https://github.com/jonahseguin/cable/blob/main/examples/chat-cloudflare/src/chat-server.ts) implements global procedures, channel authorization, events, and the channel-scoped `info` procedure.
3. [`src/worker.ts`](https://github.com/jonahseguin/cable/blob/main/examples/chat-cloudflare/src/worker.ts) connects those implementations to Cloudflare Durable Objects and uses Hono for `/openapi.json` and `/notifications`.
4. [`src/app.tsx`](https://github.com/jonahseguin/cable/blob/main/examples/chat-cloudflare/src/app.tsx) uses the client from a React view.

The example's display-name bearer token is local development scaffolding. Replace `identityFromRequest` with your application's authentication before deployment. Its [README](https://github.com/jonahseguin/cable/tree/main/examples/chat-cloudflare#readme) has the commands, endpoint calls, and local secret setup.

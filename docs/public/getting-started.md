---
title: Get started
description: Run Cable's local Cloudflare chat example from a checkout of this private repository, then inspect the contract, Worker, client, and Node development path.
---

Cable is not published yet. Use a repository checkout to run the example and inspect the workspace packages.

## Install the workspace

```bash
git clone https://github.com/jonahseguin/cable.git
cd cable
bun install
```

Cable uses Bun `1.4.0`. The Cloudflare example also uses Wrangler through its workspace dependencies.

## Run the Cloudflare chat example

In one terminal, create the local Worker secret and start Wrangler:

```bash
cp examples/chat-cloudflare/.dev.vars.example examples/chat-cloudflare/.dev.vars
(cd examples/chat-cloudflare && bunx wrangler dev --local)
```

Set `CABLE_GRANT_SECRET` in `.dev.vars` to at least 32 random characters before starting Wrangler. In a second terminal, start the Vite application:

```bash
bun --filter @cable/example-chat-cloudflare dev
```

The example's local identity is a display name sent as a bearer token. It is only for local development. Replace `identityFromRequest` with application authentication before deployment. Its Worker code is in `examples/chat-cloudflare/src/worker.ts`; the shared contract is in `examples/chat-cloudflare/src/api.ts`.

## Run without Wrangler

The same example has a Node development entry point:

```bash
bun --filter @cable/example-chat-cloudflare dev:node
```

This path uses `@cable/adapter-node` and is useful for local development. It does not replace the Cloudflare Durable Object runtime.

## Check the docs site

```bash
bun run docs:dev
bun run docs:validate
bun run docs:build
```

The documentation site is a local static build. It has no deployment configuration or hosted AI endpoint.

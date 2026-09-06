# Cable chat

This example uses `@cable/react` channel hooks and native TanStack Query
options. Its root creates one QueryClient per server render and browser root.

For the Cloudflare version, copy `.dev.vars.example` to `.dev.vars`, set a
secret of at least 32 characters, start `bunx wrangler dev --local`, then run
`bun --filter @cable/example-chat-cloudflare dev`.

For local Node development without Wrangler, set `CABLE_GRANT_SECRET` and run:

```sh
bun --filter @cable/example-chat-cloudflare dev:node
```

The command builds the Node API for Node, starts it on port 8789, and starts
Vite in Node mode. Vite proxies `/_cable` HTTP and WebSocket traffic to that
API, so the same browser UI and contract run in both modes. Node state stays in
memory and disappears when the API process stops.

The browser sends its display name as a bearer token. That only supports local
development. Replace `identityFromRequest` with application authentication
before deployment.

Run `bun --filter @cable/example-chat-cloudflare test:integration` for the
local Worker smoke, or `bun --filter @cable/example-chat-cloudflare
test:integration:node` for the Node smoke. Both connect Alice and Bob and
check delivery, presence, history, global RPC, and the HTTP host fallback.

# Cloudflare chat

This M4 example uses `@cable/react` channel hooks and native TanStack Query
options. Its root creates a QueryClient per server render and browser root, so
request data never escapes into another SSR response.

Run `bun install`, then copy `.dev.vars.example` to `.dev.vars` and replace its
secret with at least 32 random characters. Start the Worker with
`bunx wrangler dev --local`, then run `bun --filter @cable/example-chat-cloudflare dev`
in another terminal.

The browser asks for a display name and sends it as a bearer token. That is only
for local development. Replace `identityFromRequest` with real token or session
verification before deploying an application based on this example.

Run `bun --filter @cable/example-chat-cloudflare test:integration` after the
workspace packages have been built. The smoke test starts an isolated local
Wrangler Worker, connects Alice and Bob through `@cable/client`, and checks
acknowledged delivery, presence, history, global RPC, and the HTTP host fallback.

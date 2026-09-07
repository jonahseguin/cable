# Cloudflare host registry proposal

Status: design note only. This is not a public API or accepted ADR.

The current Cloudflare setup repeats a namespace mapping: `cloudflareHost` receives `peer(env, key)` and `createHandler` receives `hosts(env)`. Both are necessary at different runtime boundaries. The Worker routes initial requests; a Durable Object constructor must resolve later peer RPC after hibernation from its own `env`.

A small future option is to let `cloudflareHost` take the same `hosts(env)` registration callback as `createHandler`. The adapter would select the target by validating the canonical key against every registered channel with `parseChannelKey`, rejecting absent or ambiguous matches. Applications could then bind one callback in both places.

This does not remove `grantSecret` from the Durable Object. The object verifies edge-signed grants independently and cannot inherit the Worker handler's closure. It also does not justify a combined application factory: Wrangler requires named Durable Object exports and migrations, and a full registry would add a broad configuration API for little gain.

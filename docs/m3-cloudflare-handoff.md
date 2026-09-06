# M3 Cloudflare conformance handoff

`bun --filter @cable/cloudflare test:workerd` exits successfully with 50 passing
tests and 2 expected native socket-send-fault skips. The callback path recovers
only from Workerd's closed-socket tag lookup error by validating the persisted
attachment; the regression runs without an uncaught tag-access error.

This pass fixed one adapter mismatch. Socket callbacks constructed a
`CloudflareConnection` with the 16 KiB default attachment limit even when the
host used a different configured limit. They now pass
`cableHost.limits.attachmentBytes`, matching `CloudflareHost.connections()`.
The unit regression sets a 100-byte limit and verifies that attachment writes
above that limit fail.

The hibernating pending-hello conformance case also evicted the same object
twice: once directly, then again through its hibernation step wrapper. The
ordinary case still forces its reconstruction. The hibernating case relies on
the wrapper's one eviction before the clock advance.

Local checks completed here:

```sh
bun --filter @cable/cloudflare test
bun --filter @cable/cloudflare typecheck
bunx vitest run packages/adapter-memory/src/conformance.test.ts
bun --filter @cable/example-chat-cloudflare test:integration
```

The Cloudflare unit suite has 13 passing tests, all three Cloudflare type
projects pass, and the chat smoke validates two clients through local Wrangler.
The repository quality gate remains the pre-push check; CI confirmation is
pending.

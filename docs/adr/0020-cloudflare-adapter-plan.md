# ADR 0020: Cloudflare adapter boundary

Status: accepted for M3 implementation

## Decision

`@cable/cloudflare` will be a thin translation between the web-standard core
and current Cloudflare Durable Objects APIs. Authentication and channel routing
stay in the edge Worker. A Durable Object owns one canonical channel key and
runs one core engine over hibernatable sockets, object storage, one alarm, and
Durable Object RPC.

The public construction shape will be:

```ts
const ChatRoom = cloudflareHost(api.chat, implementation, {
  grantSecret: (env: Env) => env.CABLE_SECRET,
  peer: (env: Env, key) => env.CHAT.getByName(key),
});

const handler = createHandler(api, procedures, {
  authenticate: (request, env) => authenticate(request, env),
  context: ({ env, identity, hosts }) => ({ env, identity, hosts }),
  credentials: { mode: "cookie", origins: ["https://app.example.com"] },
  grants: (identity, key, params) => grantsFor(identity, key, params),
  grantSecret: (env) => env.CABLE_SECRET,
  hosts: (env) => [{ channel: api.chat, namespace: env.CHAT }],
  uid: (identity) => identity.userId,
});
```

`cloudflareHost` returns a `DurableObject` class rather than depending on
subclass fields. Cloudflare constructs a Durable Object before subclass field
initializers run, while the engine needs a complete `ChannelImplementation`.
Passing the implementation to the factory gives it complete type evidence and
removes initialization-order ambiguity. `peer` returns the stub for any target
host key, so application code can address a different channel family without
assuming that every family shares one namespace.

`createHandler` receives shallow `{ channel, namespace }` registrations. It
does not derive bindings from environment property names or recursively map the
contract type. `context` is the only conversion from Cable's authenticated edge
context into the context type chosen by `implement(api)`. The `hosts` value in
that callback is a typed edge peer facade for host emit and procedure calls.

The lazy facade keeps the contract's named channel paths and infers one channel
node when that path is accessed:

```ts
await ctx.hosts.feed({}).emit("created", post);
const page = await ctx.hosts.chat({ roomId }).call("recent", input);
```

The Proxy validates raw parameters and derives its host key when `emit` or
`call` is awaited. Event data uses the server event's schema input type.
Procedure input uses its input schema input type, and the result uses its output
schema output type. The peer call carries the current edge identity, grants,
and optional user ID. The mapped type keeps schema inference at the accessed
leaf. M3 adds a separate generated edge type program that exercises every
channel leaf without importing `@cable/core` into the client program. The
client and edge programs each enforce the existing strict type-performance
limits independently.

## Edge request boundary

The edge handler performs these steps before obtaining a Durable Object stub:

1. Match the configured base path and reject an invalid method, content type,
   WebSocket upgrade, or credential mode.
2. For an upgrade, require both `ch=<canonical key>` and
   `params=<JSON raw params>`. Select the registered channel by parsing `ch`,
   run its Standard Schema once on the raw parameters, and require the derived
   key to equal `ch`.
3. Authenticate the original request, derive a bounded `uid` and grants, and
   sign a grant with a 60-second default lifetime.
4. Reject a host key over 1,024 UTF-8 bytes. Route with
   `namespace.getByName(hostKey)` so `ctx.id.name` remains available after an
   alarm or hibernation wake.
5. Clone the upgrade request without `Cookie`, `Authorization`, the browser
   token query parameter, or any caller-supplied Cable internal header. Add the
   signed grant as a private `x-cable-grant` header and forward it with
   `stub.fetch()`.

Cookie mode requires an exact `Origin` allowlist for browser WebSocket
upgrades. Cable POST routes require `Content-Type: application/json`; this both
matches the only v1 codec and prevents a simple cross-site form request from
executing with ambient cookies. Cacheable GET procedures remain limited to
contract procedures that explicitly declare GET. Bearer mode does not treat
Origin as identity and leaves token verification to `authenticate`; the edge
still strips the credential before forwarding to the host.

Rejected edge authentication must not obtain a stub, sign a grant, or wake a
host. The Durable Object verifies the private grant again and compares its
destination with `ctx.id.name`. The host never accepts raw credentials, raw
parameter input, or a client-selected connection ID.

## Durable Object mapping

The returned class will build a fresh engine in every constructor. It requires
`ctx.id.name`; objects reached through `newUniqueId()`, `idFromString()`, or a
name longer than 1,024 bytes are unsupported and fail before handlers are
installed. This is an adapter invariant, not durable application state.

Its methods map directly to the core handlers:

- `fetch` validates an internal WebSocket upgrade and grant, calls
  `handlers.onUpgrade`, then creates a `WebSocketPair`, calls
  `ctx.acceptWebSocket(server, tags)`, serializes the returned attachment, and
  returns the client socket in a 101 response. If socket setup fails after the
  engine reserves a grant, the socket closes and the durable handshake deadline
  reclaims the reservation.
- `webSocketMessage`, `webSocketClose`, and `webSocketError` wrap the supplied
  socket as a core `Connection` and return the corresponding handler promise.
  Cloudflare supports async hibernatable callbacks, so these methods do not
  detach engine work into `waitUntil`.
- `alarm` awaits `handlers.onAlarm`. Core timer records remain stored and are
  re-armed when application timer work fails; Cloudflare's alarm retry is an
  additional at-least-once delivery mechanism.
- `__cable_peer(message)` awaits and returns `handlers.onPeer(message)`. Both
  `Peers.send` and `Peers.call` await Cloudflare RPC because every RPC call is
  asynchronous.

A Cloudflare `Connection` reads and writes its attachment through
`deserializeAttachment` and `serializeAttachment`, obtains immutable tags with
`ctx.getTags`, and exposes the socket's `bufferedAmount` in bytes. The adapter
validates attachment shape on every reconstruction. `connections(tag)` wraps
`ctx.getWebSockets(tag)` each time; it never keeps an authoritative socket map.
Cable uses at most the `cid:` and `uid:` tags and rejects a `uid:` tag over
Cloudflare's 256-character limit before routing the upgrade.

The adapter advertises a 16,384-byte attachment limit and Cable's portable
1 MiB frame limit. Cloudflare currently accepts larger inbound WebSocket
messages, but raising Cable's wire limit for one adapter would weaken portable
behavior and replay chunk bounds. The class registers Cloudflare's host-wide
`setWebSocketAutoResponse` for the literal Cable `ping` and `pong` pair. Literal
ping is valid before and after hello, performs no application work, and does not
satisfy or extend the durable handshake deadline. Cloudflare separately handles
WebSocket protocol control pings.

## Storage, alarms, and peers

`Host.storage` uses the asynchronous KV surface available on both new SQLite
objects and legacy objects. Array `get`, `put`, and `delete` operations are
chunked where Cloudflare imposes per-call limits. `list` preserves Cable's
inclusive `start`, exclusive `end`, prefix, reverse, and limit semantics.
`transaction` supplies a transaction-scoped adapter; a nested Cable transaction
reuses that scope. On SQLite objects, the optional `sql` capability wraps the
synchronous cursor in an `AsyncIterable` without changing row values.

`Schedule` maps to `getAlarm`, `setAlarm`, and `deleteAlarm`. The adapter never
sets an alarm in its constructor, since a constructor also runs immediately
before an existing alarm after a wake. `Host.waitUntil` delegates to
`DurableObjectState.waitUntil` for interface consistency, although Cloudflare
keeps Durable Objects active while I/O is pending and documents that this call
does not extend their lifetime.

`Peers` asks the configured `peer(env, key)` resolver for a stub and calls its
reserved `__cable_peer` RPC method. Peer messages remain structured-cloneable
plain data and are parsed by the receiving engine. Adapter code never reads or
writes engine-owned storage prefixes.

## Runtime-neutral split

Core will own route and peer behavior that is identical on Cloudflare, Node,
and Rivet:

- collect registered channel nodes without recursively mapping their types;
- select one channel for a canonical key and validate raw channel parameters;
- create the lazy named `hosts` facade over `Peers`;
- build and parse the internal peer emit and call messages;
- apply the base path, RPC and host-fallback route semantics; and
- clone a request while removing credentials and reserved Cable headers.

The Cloudflare package will own Durable Object namespaces and stubs,
`WebSocketPair`, hibernation callbacks and attachments, Cloudflare storage and
alarm wrappers, the private grant header transport, credential-mode policy,
and Worker responses. This keeps Cloudflare types out of core and gives the
later Node and Rivet adapters the same authentication and routing rules.

M3 can proceed in four non-overlapping workstreams after M2 is green:

1. Core route registration, the typed host facade, peer envelopes, and focused
   web-standard tests.
2. Cloudflare `Host`, storage, alarm, connection, and peer RPC wrappers with
   adapter unit tests.
3. `cloudflareHost`, `createHandler`, credential safeguards, and workerd
   conformance including forced eviction.
4. Client integration, the runnable chat example, documentation review, and
   the repository-wide release gates.

## Verification and compatibility floor

M3 tests will use Vitest 4.1 or later with `@cloudflare/vitest-plugin` in a real
local workerd runtime. The earlier design named
`@cloudflare/vitest-pool-workers`; Cloudflare replaced that package in August 2026. WebSocket tests run serially with shared test storage, as required by the
plugin's current WebSocket limitation.

The conformance suite will cover ordinary operation and call
`evictDurableObject(stub, { webSockets: 'hibernate' })` between steps to prove
socket attachment and storage reconstruction through an actual constructor
reset. It will also use `runDurableObjectAlarm` for timer behavior and test peer
RPC between two named objects. Edge tests must prove that rejected credentials
do not create a Durable Object, that a tampered internal grant is rejected
before socket acceptance, and that host keys and user IDs at the Cloudflare
limits fail predictably.

The example will use ES modules, a compatibility date on or after 2026-04-07,
and a SQLite Durable Object declaration. That date supplies the current close
handshake behavior, while RPC itself requires only 2024-04-03. Runtime types
come from generated Wrangler types; package tests receive `cloudflare:test` and
`cloudflare:workers` types from the Vitest plugin.

## Current Cloudflare references

- [Hibernatable WebSockets and serialized attachments](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Durable Object state, socket tags, and automatic responses](https://developers.cloudflare.com/durable-objects/api/state/)
- [Named Durable Object IDs and `ctx.id.name`](https://developers.cloudflare.com/durable-objects/api/id/)
- [Durable Object alarms and retry behavior](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [Durable Object KV transactions and list semantics](https://developers.cloudflare.com/durable-objects/api/legacy-kv-storage-api/)
- [Durable Object RPC methods](https://developers.cloudflare.com/durable-objects/best-practices/create-durable-object-stubs-and-send-requests/)
- [Durable Object runtime limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Workers Vitest test APIs, including forced eviction](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)
- [Migration from the old Vitest pool package](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/)

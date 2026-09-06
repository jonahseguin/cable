# Sock8 reference

Sock8 is an unfinished predecessor of cable. The squashed subtree matches the
upstream tree for `87065f464c7bd8a81a8a40a2de13185b7726ad78`, declared in
`references/lock.json`. This note records the snapshot, not a compatibility target.
Cable's protocol, accepted ADRs, runtime documentation, and tests remain the
authority.

## What the snapshot implements

`packages/sdk/dsl.md` and `packages/sdk/src/server/lib/channels.ts` define
dot-separated channel paths. Parameterized paths resolve through `.for(params)`.
The endpoint holds one payload schema and optional presence, history, transform,
and emit settings. `packages/sdk/src/client/lib/connection.ts` connects after an
authentication request, routes received messages, and supports presence messages
and an HTTP history request. `packages/next/src/client/use-presence.ts` and
`use-history.ts` build framework hooks on those client methods.

The Cloudflare API has three Durable Object roles. `socket-shard.ts` accepts a
hibernatable WebSocket, tags it with socket and identity strings, stores a
`socket:<id>` record, and rebuilds subscription maps from storage and
`state.getWebSockets()`. `presence-channel.ts` persists `presence:<identity>`
records and schedules cleanup with a Durable Object alarm. `channel-router.ts`
assigns and routes shards. `routes/history.router.ts` reads a separate R2 history
store.

These paths show that parameterized channels, basic presence, and parts of socket
rehydration were built. They do not establish a complete durable channel engine.

## Differences that cable keeps deliberate

| Sock8 snapshot                                                                                              | Cable design                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| One endpoint payload schema and a Next.js-oriented client surface                                           | Separate client and server event maps with runtime-neutral contracts                               |
| Process-local socket, subscription, presence, debounce, and throttle maps, followed by partial rebuild work | The runtime is authoritative; attachments and storage hold durable facts and memory is a cache     |
| Presence traffic handled by the socket message callback; other events log as unhandled                      | A strict bidirectional channel protocol with codec tests and declared failure behavior             |
| R2 history behind a separate HTTP route                                                                     | An engine-owned, monotonic per-host event log, resume cursor, replay, and reset semantics          |
| Router, shards, presence, history, analytics, and regional services coupled early                           | One host per channel instance, with conformance tests before optional sharding or framework layers |

## Limits of the reference

The socket close callback returns when its in-memory socket maps were not rebuilt.
The message callback handles `setPresence` and `getPresence`; it logs other message
events as unhandled. The source contains SDK tests, but no Durable Object runtime or
forced-hibernation conformance suite. Treat each behavior as an implementation lead
to verify, not proof of delivery, ordering, replay, or hibernation safety.

The snapshot has no repository-level license file or declaration;
`packages/typescript-config/package.json` declares `PROPRIETARY`. Do not copy code
from it. If a later port becomes appropriate, settle licensing first and attribute
the exact source path and license.

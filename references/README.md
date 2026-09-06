# Reference repositories

These are squashed Git subtrees used as local reading material for the cable
design and implementation. They are not part of the build. Do not import from
them, edit them, or copy code without an attribution comment that names the
source path and license.

Initialize them from the repository root with:

```sh
scripts/refs.sh init
```

The source is already present after cloning the parent repository. `init` is a
cheap consistency check for agents and new contributors. Use
`scripts/refs.sh update <name> [ref]` to pull one reference as a squashed
commit. The command updates `references/lock.json`; review and commit that pin
before updating another reference. Use `scripts/refs.sh status` to print the
source commit recorded by each subtree. `references/lock.json` is the
machine-readable pin file.

The Effect article [The One Weird Git Trick That Makes Coding Agents More
Effect-ive](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive)
recommends Git subtrees because their source is immediately present after a
clone. This repository follows that pattern with `--squash`: upstream history
does not enter cable's history, while source files remain directly greppable by
agents. `scripts/refs.sh` records and checks the source commit, and provides a
repeatable update command.

## Reference implementations

The paths below describe the source at the pinned commits. Upstream layouts
may change when a subtree is updated; inspect the pinned tree before relying
on a path.

| Repo | Source commit | License | What to look at | Why |
| --- | --- | --- | --- | --- |
| [`trpc/trpc`](https://github.com/trpc/trpc) | `66d054454a3339dd8421da9dcf0648f92816f704` | MIT | `packages/server/src/unstable-core-do-not-import.ts` (router, procedure builder, middleware typing); `packages/server/src/adapters/ws.ts`; `packages/server/src/adapters/fetch/`; `packages/client/src/links/httpBatchLink.ts`; `packages/tanstack-react-query/`; `examples/.test/diagnostics-big-router/` | DX to imitate; the Node WS adapter and subscription model to replace; TanStack options-proxy and TypeScript performance fixture |
| [`unnoq/orpc`](https://github.com/unnoq/orpc) | `6f5501f3f331eceda23dd306793c01ad7f6dddba` | MIT | `packages/contract/`; `packages/server/src/adapters/websocket/`; `packages/server/src/adapters/standard/`; `packages/shared/src/iterator.ts`; `packages/tanstack-query/` | Contract-first design, per-procedure errors, Standard Schema integration, and iterator/resume approaches. The design's `packages/experimental-durable-iterator/` path is absent at this commit. |
| [`Effect-TS/effect`](https://github.com/Effect-TS/effect) | `1747d842c80413dc4488574600c935d240d662d2` | MIT | `packages/effect/src/Schema.ts`; `packages/effect/src/unstable/rpc/`; `packages/effect/src/unstable/httpapi/`; `packages/effect/src/unstable/socket/` | `@cable/effect`: typed errors, RPC, HTTP APIs, sockets, and layers. The design's older `packages/rpc/` and `packages/platform/src/HttpApi*.ts` paths have moved. |
| [`rivet-dev/actors`](https://github.com/rivet-dev/actors) | `caed5835fe3cc3cd37c9a6eb715abd5105024f2a` | Apache-2.0 | `rivetkit-typescript/packages/rivetkit/`; `rivetkit-typescript/packages/react/`; `docs/content/docs/` | Actor definitions, WebSocket lifecycle and hibernation, connection state, drivers, and documentation. Older commits may use `site/src/content/docs/`; the setup script detects either path. |
| [`cloudflare/agents`](https://github.com/cloudflare/agents) | `ec93caf6ec1efebb521aa9ab30c0a8cb2b4d50d5` | MIT; bundled PartyServer substrate is ISC | `packages/agents/src/lifecycle/`; `packages/agents/src/websockets/`; `packages/agents/src/` | Durable Object hibernation mechanics, tags, attachments, alarms, and callable/state-sync patterns. Current Agents no longer contains a separate `packages/partyserver/` tree. |
| [`cloudflare/partykit` (PartyServer)](https://github.com/cloudflare/partykit/tree/main/packages/partyserver) | `f0a2e97d233f24545b2648aec2ed6a191e11074e` | ISC (`packages/partyserver`) | `packages/partyserver/src/` | The standalone PartyServer Durable Object/WebSocket wrapper, retained as a separate reference after Agents moved its substrate into `agents/lifecycle`. |
| [`cloudflare/capnweb`](https://github.com/cloudflare/capnweb) | `3edfc500a97361b1bdac97c260c9597f500748c6` | MIT | `src/` | Compare object-capability RPC and bidirectional-call framing with cable's own protocol. |
| [`sock-8/sock8`](https://github.com/sock-8/sock8) | `87065f464c7bd8a81a8a40a2de13185b7726ad78` | No repository-level license; `packages/typescript-config` declares `PROPRIETARY` | `packages/sdk/dsl.md`; `packages/sdk/src/server/lib/channels.ts`; `packages/sdk/src/client/lib/{proxy,connection}.ts`; `packages/next/src/client/{use-presence,use-history}.ts`; `apps/api/src/durable-objects/{socket-shard,presence-channel}.ts`; `apps/api/src/services/{connection,presence,publish}-service.ts` | An unfinished predecessor of cable. Study its parameterized-channel direction and early Durable Object experiments; do not treat its behavior, tests, or implementation choices as authority. |

Rivet currently ships its TypeScript implementation under
`rivetkit-typescript/` and its public docs source under `docs/content/docs/`.
The subtree snapshot includes the complete pinned repository, so those paths
are directly available even though cable tooling excludes `references/**`.
PartyServer currently declares ISC in its package metadata; the separate
`references/partyserver` subtree is intentionally kept alongside Agents so
that its implementation and license remain directly inspectable.

Sock8's lock URL uses SSH, so `scripts/refs.sh update sock8` requires GitHub SSH
access. The snapshot has no repository-level license file or declaration;
`packages/typescript-config/package.json` declares `PROPRIETARY`. It is controlled
reference material. Do not port its code unless its licensing is settled and the
port is attributed. See [the Sock8 reference note](../docs/sock8-reference.md)
before relying on it.

## External documentation

These links are useful context but are not vendored or pinned.

### Cloudflare (runtime #1)

- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [WebSockets and Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Storage API](https://developers.cloudflare.com/durable-objects/api/storage-api/)
- [Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Workers RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/)
- [Workers WebSockets](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
- [Vitest pool for Workers](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Agents SDK](https://developers.cloudflare.com/agents/)
- [Cap'n Web](https://github.com/cloudflare/capnweb)

### Rivet (runtime #2)

- [Actors docs](https://rivet.dev/actors/docs/)
- [WebSocket handler](https://rivet.dev/actors/docs/websocket-handler)
- [Connections](https://rivet.dev/actors/docs/connections)
- [Authentication](https://rivet.dev/actors/docs/authentication)
- [Lifecycle](https://rivet.dev/docs/actors/lifecycle)
- [Hibernation announcement](https://rivet.dev/changelog/2025-11-24-introducing-live-websocket-migration-hibernation/)
- State, KV, scheduling, actor communication, and the Cloudflare driver are linked from the [Actors docs](https://rivet.dev/actors/docs/).
- [Rivet skills](https://github.com/rivet-dev/skills)

### tRPC (DX we imitate)

- [Docs](https://trpc.io/docs)
- [Fetch adapter](https://trpc.io/docs/server/adapters/fetch)
- [Subscriptions](https://trpc.io/docs/server/subscriptions)
- [WebSocket adapter](https://trpc.io/docs/server/websockets)
- [TanStack React Query integration](https://trpc.io/docs/client/tanstack-react-query/setup)
- [Error handling](https://trpc.io/docs/server/error-handling)

### oRPC (closest existing solution)

- [Docs](https://orpc.unnoq.com/docs)
- [Contract-first](https://orpc.unnoq.com/docs/contract-first/define-contract)
- [Typed errors](https://orpc.unnoq.com/docs/error-handling)
- [Hibernation plugin](https://orpc.unnoq.com/docs/plugins/hibernation)
- [Durable Iterator](https://orpc.unnoq.com/docs/integrations/durable-iterator)
- [Event iterator and resume semantics](https://orpc.unnoq.com/docs/event-iterator)

### Effect

- [Docs](https://effect.website/docs)
- [Effect source in `references/effect`](https://github.com/Effect-TS/effect)
- The docs cover Schema and Standard Schema interop, tagged errors, Layers, Stream, `@effect/rpc`, and `@effect/platform`.

### Standard Schema

- [Standard Schema specification](https://standardschema.dev)

### tRPC issues and discussions

Read these before implementing the related milestones:

- [Discussion #4400](https://github.com/trpc/trpc/discussions/4400) — WebSockets on Cloudflare Durable Objects
- [Issue #6598](https://github.com/trpc/trpc/issues/6598) — Web-standard streams for the WS core
- [Discussion #5508](https://github.com/trpc/trpc/discussions/5508) and [#2448](https://github.com/trpc/trpc/discussions/2448) — TypeScript performance on large routers
- [Discussion #3939](https://github.com/trpc/trpc/discussions/3939) — backend module graph imported by clients
- [Issue #3438](https://github.com/trpc/trpc/issues/3438) and [#6832](https://github.com/trpc/trpc/issues/6832) — per-procedure typed errors
- [Issue #5413](https://github.com/trpc/trpc/issues/5413) — global server-side error handling
- [`cleaton/cloudflare-trpc-websocket`](https://github.com/cleaton/cloudflare-trpc-websocket) — community Durable Object port

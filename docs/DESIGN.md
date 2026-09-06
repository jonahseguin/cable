# cable — Design & Handoff Document

> Working name: **cable** (knit stitch + network cable). Not final. Use the npm
> scope `@cable/*` everywhere, but keep the name in exactly one place per package
> (`package.json` `name`) and in a repo-root `NAME.md` so a rename is a search/replace.
> Do not put "cf", "cloudflare", "durable", or "rivet" in the name; the library
> targets both Cloudflare and Rivet.
>
> Candidates considered (all continue the sock8 yarn/knitting lineage):
> **cable** (recommended — knit stitch *and* network cable), **purl** (knit
> stitch + the sound of running water), **skein** (a coiled length of yarn),
> **weft** (the crosswise threads in weaving). npm scope and domain
> availability were **not** checked; the agent should check
> `npm view @<name>/core` and the `.dev`/`.sh` domains for the shortlist and
> report back before publishing anything.

**Status:** design complete for contract, host interface, and transport. No code
exists yet. This document is the single source of truth for the first
implementation. Where it says "decided", do not re-litigate without asking;
where it says "open", pick a reasonable default, document it in
`docs/adr/`, and move on.

**Audience:** a coding agent starting from an empty directory.

---

## 0. TL;DR

We are building an open-source, end-to-end type-safe API layer for
TypeScript monorepos — tRPC-shaped procedures **plus** a first-class, durable,
typed WebSocket channel model — purpose-built for actor-style runtimes
(Cloudflare Durable Objects first, Rivet second).

- **Contract-first.** A zero-runtime-dependency contract package is the shared
  artifact between client and server. No codegen.
- **Procedures** (`query`/`mutation`) with per-procedure typed errors, over
  HTTP (batched), executed in the stateless edge Worker — or **host-scoped**
  procedures executed inside a channel's host.
- **Channels** are parameterized patterns (`chat.{roomId}`) with explicit
  server→client and client→server event schemas, presence, and history. One
  host instance (one DO / one actor) per channel *instance*.
- **Durable by default.** Every channel keeps a per-host monotonic event log
  so reconnects resume with `since` instead of dropping events. History is the
  same log with longer retention.
- **Own wire protocol.** JSON text frames v1, designed around WebSocket
  Hibernation: the host can be evicted from memory at any time and must
  rebuild from sockets + per-connection attachments + storage.
- **One client, N sockets.** The client library opens one socket per host the
  app is subscribed to and hides it behind a single typed client object.
- **Effect** is first-class but optional, via a separate package. The core is
  plain Promise-based TypeScript with Standard Schema validation.

---

## 1. Context

### 1.1 Why this exists

tRPC gives full-stack TypeScript teams typed APIs without codegen, but:

- Its WebSocket adapter is built on Node's `ws` library and its subscriptions
  are observables materialized on connect. Both are fundamentally incompatible
  with Cloudflare Durable Objects and WebSocket Hibernation. There is no
  official DO adapter; the community ports are hacks.
- Importing `AppRouter` on the client pulls the entire backend module graph into
  the frontend TypeScript program ("backend suck-in"), and TS performance
  degrades non-linearly with router size (teams report 4–8s type resolution).
- No per-procedure typed errors (open since 2022; a 2025 proposal borrows
  oRPC's `.errors()` design).
- Each adapter reimplements transport (~600 LOC each for ws / uWebSockets),
  with adapter-specific bugs.

oRPC fixed several of these (contract package, `.errors()`, OpenAPI, a
Hibernation plugin and an experimental "Durable Iterator" for DOs). Cloudflare
ships Cap'n Web (object-capability RPC over HTTP/WS) and the Agents SDK.
RivetKit offers an actor framework with actions/events that runs on DOs and
Rivet. None of them offer: tRPC-shaped procedures **and** an explicit typed
bidirectional channel contract **and** hibernation-native durability **and**
a runtime-portable host abstraction, in one library.

### 1.2 Prior art in this repo's lineage: sock8

The author previously built **sock8** (sock8.com), "type-safe realtime for
Next.js", as a WebSockets-as-a-service product on Cloudflare Durable Objects.
Its channel DSL is the seed for this library's channel model and should be
preserved in spirit:

```ts
export const channels = sock8.channels({
  'chat.{roomId}.messages': sock8.channels.rich({
    schema: z.object({ message: z.string(), sender: z.string(), timestamp: z.number() }),
    capabilities: {
      history: true,
      presence: z.object({ typing: z.boolean(), online: z.boolean() }),
    },
  }),
});
// client
channels.chat.messages.for({ roomId: '123' })
// auth
authorize: (conn) => { conn.identifyAs(user.id); conn.grant(channels.for({ userId: user.id })); }
```

What changes vs sock8: framework-agnostic (TanStack/React first, not Next.js),
open-source library instead of a hosted service, and procedures added
alongside channels so it is a complete API layer.

### 1.3 Reference implementations to study (vendored under `references/`)

See §3.3 for setup. Study, don't copy. Check each repo's LICENSE (tRPC, oRPC,
Effect are MIT; Rivet is Apache-2.0; Cloudflare repos are mostly MIT/Apache).
If a non-trivial algorithm is ported, add an attribution comment with the
source path and license.

| Repo | What to look at | Why |
|------|-----------------|-----|
| `trpc/trpc` | `packages/server/src/unstable-core-do-not-import/` (router, procedure builder, middleware typing), `packages/server/src/adapters/ws.ts`, `packages/server/src/adapters/fetch/`, `packages/client/src/links/httpBatchLink.ts`, `packages/tanstack-react-query/`, `examples/.test/diagnostics-big-router/` | The DX we are imitating; the WS adapter and subscription model we are *not* imitating; the TanStack options-proxy pattern; the TS perf fixture to beat |
| `unnoq/orpc` | `packages/contract/`, `packages/server/src/adapters/websocket/`, `packages/server/src/adapters/standard/`, `packages/experimental-durable-iterator/`, `packages/tanstack-query/` | Contract-first design, `.errors()` per procedure, Standard Schema integration, their DO hibernation approach (compare against ours) |
| `Effect-TS/effect` | `packages/effect/src/Schema.ts` (incl. Standard Schema support), `packages/rpc/`, `packages/platform/src/HttpApi*.ts`, `packages/platform/src/Socket.ts` | For the `@cable/effect` package: how Effect models RPC, typed error channels, Streams over sockets, Layers |
| `rivet-dev/actors` (formerly `rivet-dev/rivet`; GitHub redirects) | `rivetkit-typescript/packages/rivetkit/` (actor definition, `onWebSocket`, conn state, hibernation, drivers incl. the Cloudflare DO driver), `rivetkit-typescript/packages/react/`, `site/src/content/docs/` (the docs source, greppable offline) | Target runtime #2. How they persist conn state across sleep, how their CF driver wraps DOs, how their gateway holds sockets during hibernation |
| `cloudflare/agents` | `packages/partyserver/` (the most battle-tested TS wrapper over DO Hibernation: `acceptWebSocket`, tags, attachments, `webSocketMessage/Close/Error`, alarms), `packages/agents/src/` (`@callable`, state sync over WS) | Reference for correct DO hibernation mechanics in TypeScript; do not copy the framework |
| `cloudflare/capnweb` (optional) | `src/` | The transport we chose *not* to build on; useful for comparing frame design and bidirectional-call ideas |

Paths are indicative; verify after cloning (these repos reorganize).

### 1.4 Documentation to read (external; not vendored)

Docs move. Prefer the `.md` / `llms.txt` variants where sites offer them
(Rivet serves any docs page as markdown by appending `.md`; Cloudflare
publishes `llms.txt` indexes). If a URL 404s, search the site, don't guess.

**Cloudflare (runtime #1)**
- Durable Objects overview: https://developers.cloudflare.com/durable-objects/
- WebSockets + Hibernation API (the single most important page): https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Storage API (KV + SQLite, transactions): https://developers.cloudflare.com/durable-objects/api/storage-api/
- Alarms: https://developers.cloudflare.com/durable-objects/api/alarms/
- DO limits (attachment size, storage per object, WS message size): https://developers.cloudflare.com/durable-objects/platform/limits/
- Workers RPC (DO stub method calls used for `Peers`): https://developers.cloudflare.com/workers/runtime-apis/rpc/
- Workers WebSockets (edge side of the upgrade): https://developers.cloudflare.com/workers/runtime-apis/websockets/
- Vitest pool for Workers: https://developers.cloudflare.com/workers/testing/vitest-integration/
- Agents SDK (for comparison only): https://developers.cloudflare.com/agents/
- Cap'n Web (for comparison only): https://github.com/cloudflare/capnweb

**Rivet (runtime #2)** — root https://rivet.dev/actors/docs/ ; append `.md` to any page
- Low-level WebSocket handler + `canHibernateWebSocket`: https://rivet.dev/actors/docs/websocket-handler
- Connections, `connState` / `createConnState`, `c.conns`: https://rivet.dev/actors/docs/connections
- Authentication / `onBeforeConnect`: https://rivet.dev/actors/docs/authentication
- Lifecycle (`onWake`, `onSleep`, `waitUntil`): https://rivet.dev/docs/actors/lifecycle
- State, KV, schedule, actor↔actor communication, Cloudflare driver: browse the sidebar from the root
- Hibernation announcement (semantics of `open` firing once, conn state persisting): https://rivet.dev/changelog/2025-11-24-introducing-live-websocket-migration-hibernation/
- Rivet ships agent skill files: `npx skills add rivet-dev/skills` (repo `rivet-dev/skills`) — install these for the agent when working on M6.

**tRPC (DX we imitate)**
- Docs root: https://trpc.io/docs
- Fetch adapter (what works on Workers): https://trpc.io/docs/server/adapters/fetch
- Subscriptions (v11 async-generator model, `tracked()` / `lastEventId`): https://trpc.io/docs/server/subscriptions
- WebSocket adapter (what we are replacing): https://trpc.io/docs/server/websockets
- TanStack React Query integration (options-proxy pattern): https://trpc.io/docs/client/tanstack-react-query/setup
- Error handling / formatting: https://trpc.io/docs/server/error-handling

**oRPC (closest existing solution)**
- Docs root: https://orpc.unnoq.com/docs
- Contract-first + `implement`: https://orpc.unnoq.com/docs/contract-first/define-contract
- Typed errors: https://orpc.unnoq.com/docs/error-handling
- Hibernation plugin (their DO approach): https://orpc.unnoq.com/docs/plugins/hibernation
- Durable Iterator (their DO realtime approach): https://orpc.unnoq.com/docs/integrations/durable-iterator
- Event iterator / resume semantics: https://orpc.unnoq.com/docs/event-iterator

**Effect**
- Docs root: https://effect.website/docs
- Schema (incl. Standard Schema interop), Error management (tagged errors), Layers, Stream, `@effect/rpc`, `@effect/platform` — navigate from the root; also vendored in `references/effect`.

**Standard Schema** — https://standardschema.dev (the spec our contract validates against).

**tRPC issues/discussions that define the problem space** (read before M1/M2):
- trpc/trpc discussion #4400 — WebSockets on Cloudflare Durable Objects (why there is no official adapter)
- trpc/trpc issue #6598 — proposal to rebuild the WS core on web-standard streams (adapter fragmentation)
- trpc/trpc discussion #5508 and #2448 — TypeScript performance on large routers
- trpc/trpc discussion #3939 — client type import "sucks in" the whole backend
- trpc/trpc issue #3438 and #6832 — per-procedure typed errors (the latter proposes oRPC-style `.errors()`)
- trpc/trpc issue #5413 — global error handling for server-side callers
- `cleaton/cloudflare-trpc-websocket` — community DO port; note the `[topic, initValue]` tuple subscriptions hack

### 1.5 Design patterns: replicate, adapt, avoid

**Replicate (tRPC DX)**
- Builder chaining for procedures: `.input().output().errors().query()/.mutation()`; router as a plain nested object; the client is a typed proxy mirroring the router shape.
- Middleware with `next({ ctx })` accumulating context types.
- Inference helpers per node (`InferInput`, `InferOutput`, `InferErrors`), never over the whole tree.
- Links pipeline on the client (`batchLink`, logger, retry) — composable, web-standard `fetch`.
- Server-side caller for tests/SSR.
- TanStack Query **options proxy** (`queryOptions()`, `mutationOptions()`, `queryKey()`) instead of wrapper hooks, so users keep native TanStack APIs.

**Replicate (oRPC)**
- Separate contract package; `implement(contract)` type-checks completeness.
- `.errors({ CODE: schema })` producing a discriminated union on the client.
- Standard Schema as the validation boundary (schema-library agnostic).
- Resume via a monotonic id (they use `lastEventId` on event iterators; we use `seq`/`since` per host).

**Replicate (socket.io DX, not its architecture)**
- Named typed events in both directions; ack callbacks (`emit` with `id` → `res`); rooms as first-class (our channel instances); automatic reconnect with backoff; connection status observable.

**Replicate (Rivet / sock8)**
- Per-connection state initialized at connect (`createConnState` ≈ our grant → attachment).
- Validate before accept (`onBeforeConnect` ≈ edge `authenticate` + host `authorize`).
- Parameterized channel patterns with typed params and capability flags (presence, history) from sock8.

**Adapt (Cloudflare Agents / partyserver)**
- Their hibernation mechanics (tags, attachments, auto-response) — replicate the mechanics inside `@cable/cloudflare`, not their class-based agent model.

**Avoid / solve (tRPC subscription challenges)**
- Observable-on-connect subscriptions: state lives in closures → dies on hibernation. **Ours:** subscriptions are implicit in the host; delivery state is `seq`/`since` in attachment + log.
- Node-only WS adapter (`ws` library, per-adapter reimplementation). **Ours:** web-standard core + one `Host` interface.
- No resume before v11; even with `tracked()` the buffer lives in user code. **Ours:** engine-owned event log with retention policy.
- Reconnect = re-run every subscription resolver. **Ours:** `hello.since` → replay from log, or `reset`.
- Untyped errors; batching via GET URL length; `AppRouter` import pulls in the backend; TS perf. **Ours:** §2.3.
- Subscriptions keyed to a single server process (no story for sharded/actor backends). **Ours:** host-per-channel-instance with `Peers` for cross-host publish.

**Avoid (general)**
- Per-user session hosts as the default topology (double wakes, orphaned subscriptions).
- Multiple channels per host in v1.
- Making Effect a hard dependency of `core`.

---

## 2. Goals, non-goals, DX targets

### 2.1 Goals

1. End-to-end type safety for procedures **and** channel events, without codegen.
2. Native to actor runtimes with hibernation: Cloudflare Durable Objects first,
   Rivet second, in-memory and Node hosts for tests/dev.
3. Durable-by-default channels: resume after reconnect, opt-in history.
4. Typed presence per channel.
5. First-class React + TanStack Query integration.
6. First-class (optional) Effect integration.
7. Cheap TypeScript: contract types must stay shallow; a large-router perf
   fixture is part of CI.

### 2.2 Non-goals (v1)

- OpenAPI generation (later; the contract makes it possible).
- Non-TypeScript clients.
- Binary/CBOR encoding (protocol reserves room for it; JSON only in v1).
- A hosted service. (Possible later product; irrelevant to the library.)
- Cross-host ordering guarantees. Ordering is per host only.
- Backpressure/flow control beyond "disconnect with retry hint".
- R2 or external archival storage for history (interface only, no adapter).

### 2.3 DX targets that fix specific tRPC pain points

| tRPC pain | Our target |
|-----------|------------|
| Backend suck-in when importing `AppRouter` | `@cable/contract` has zero runtime deps and never imports server code; client imports only the contract |
| TS perf non-linear in router size | Shallow builder generics; contract is plain object types; CI fixture with 200 procedures / 40 channels must type-check under a budget (see §11) |
| Untyped errors | `.errors({ CODE: schema })` on every procedure and client emit; client gets a discriminated union |
| Adapter fragmentation | Core is web-standard (`Request`/`Response`, `WebSocket`, `ReadableStream`); adapters are thin shims implementing one `Host` interface |
| WS incompatible with serverless | Engine is a hibernation-safe state machine; nothing authoritative lives in memory |
| Global error handling missing | `onError` hooks on server handler, client, and host engine |

---

## 3. Repository setup

### 3.1 Tooling (decided)

- **Package manager:** pnpm (workspaces). Node 22+.
- **Language:** TypeScript 5.x, `strict`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: bundler`.
  Enable `isolatedDeclarations` on `@cable/contract` if feasible (forces
  explicit, cheap public types).
- **Build:** `tsdown` (or `tsup` if tsdown misbehaves). ESM only. `exports` maps
  with `types` first.
- **Test:** Vitest. `@cloudflare/vitest-pool-workers` for the Cloudflare
  adapter package. Rivet adapter tests run against RivetKit's in-process/file
  driver.
- **Lint/format:** Biome.
- **Versioning:** Changesets.
- **Validation:** Standard Schema (`@standard-schema/spec`) — accept Zod v4,
  Valibot, ArkType, Effect Schema uniformly. Tests use Zod v4.
- **CI:** GitHub Actions: typecheck, lint, unit tests, CF adapter tests
  (workerd), TS perf budget check.

### 3.2 Layout

```
cable/
├── NAME.md                       # the working name and rename checklist
├── package.json                  # private workspace root
├── pnpm-workspace.yaml
├── biome.json
├── tsconfig.base.json
├── .changeset/
├── .github/workflows/ci.yml
├── docs/
│   ├── DESIGN.md                 # this document
│   ├── adr/                      # one file per decision, numbered
│   └── protocol.md               # wire protocol, kept in sync with codec tests
├── references/                   # git submodules, read-only, excluded from tooling (see 3.3)
│   ├── README.md
│   ├── trpc/
│   ├── orpc/
│   ├── effect/
│   ├── rivet/                    # rivet-dev/actors monorepo, sparse-checked-out to rivetkit-typescript/ + docs
│   ├── cloudflare-agents/        # cloudflare/agents (partyserver = DO hibernation reference)
│   └── capnweb/                  # optional
├── scripts/
│   ├── refs.sh                   # init/update references
│   └── ts-perf.ts                # runs tsc --extendedDiagnostics on the perf fixture
├── packages/
│   ├── contract/                 # @cable/contract — DSL + types. ZERO runtime deps.
│   ├── core/                     # @cable/core — protocol codec, Host interfaces, host engine, procedure runtime, errors
│   ├── client/                   # @cable/client — HTTP link, socket manager, typed proxy
│   ├── react/                    # @cable/react — hooks + TanStack Query options proxy
│   ├── adapter-memory/           # @cable/adapter-memory — MemoryHost + in-process transport (tests)
│   ├── adapter-node/             # @cable/adapter-node — NodeHost on `ws` (local dev without wrangler)
│   ├── cloudflare/               # @cable/cloudflare — cloudflareHost(), createHandler()
│   ├── rivet/                    # @cable/rivet — rivetHost(), createHandler()
│   ├── effect/                   # @cable/effect — Effect integration
│   └── conformance/              # @cable/conformance — Host conformance test suite (run against every adapter)
├── examples/
│   ├── chat-cloudflare/          # Worker + DO + TanStack Start client
│   └── chat-rivet/
└── fixtures/
    └── big-contract/             # TS perf fixture: 200 procedures, 40 channels
```

Dependency direction (enforce with a lint rule or `dependency-cruiser`):

```
contract  ←  core  ←  { client, cloudflare, rivet, adapter-memory, adapter-node, effect }
client    ←  react
core      ←  conformance
```

`@cable/contract` may depend only on `@standard-schema/spec` (types-only).
`@cable/core` may not import any Node, Cloudflare, or Rivet API. Anything
platform-specific lives in an adapter package.

### 3.3 Vendoring reference repositories

Use **shallow git submodules** so the repo stays small and the code is pinned
and greppable locally. They are for reading, not building.

```bash
# from repo root, once:
git submodule add --depth 1 https://github.com/trpc/trpc.git          references/trpc
git submodule add --depth 1 https://github.com/unnoq/orpc.git         references/orpc
git submodule add --depth 1 https://github.com/Effect-TS/effect.git   references/effect
git submodule add --depth 1 https://github.com/rivet-dev/actors.git   references/rivet
git submodule add --depth 1 https://github.com/cloudflare/agents.git  references/cloudflare-agents
git submodule add --depth 1 https://github.com/cloudflare/capnweb.git references/capnweb   # optional

# make shallowness persistent for fresh clones
for m in trpc orpc effect rivet cloudflare-agents capnweb; do
  git config -f .gitmodules submodule.references/$m.shallow true
done
git add .gitmodules references
git commit -m "chore: add reference repos as shallow submodules"
```

**Rivet is a large monorepo** (Rust engine + TypeScript). Sparse-checkout it
to the parts we read so the working tree stays small:

```bash
cd references/rivet
git sparse-checkout init --cone
git sparse-checkout set rivetkit-typescript site/src/content/docs
cd -
```

If the `rivet-dev/actors` URL doesn't resolve, use `rivet-dev/rivet` (the
repo was renamed; GitHub redirects either way). The TypeScript library lives
under `rivetkit-typescript/packages/rivetkit/`; the docs source under
`site/src/content/docs/` is the fastest way to grep Rivet behaviour offline.

`scripts/refs.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
# Initialize or update the read-only reference repos.
git submodule update --init --depth 1 --recursive references/
# Re-apply sparse checkout for the Rivet monorepo (idempotent).
( cd references/rivet && git sparse-checkout init --cone \
    && git sparse-checkout set rivetkit-typescript site/src/content/docs )
# Pin to the default branch tip at time of update; record SHAs for the log.
git submodule status references/
```

Record the SHAs from `git submodule status` in `references/README.md` each
time they are bumped, so design notes can cite "as of <sha>".

Exclusions — the references must be invisible to every tool:

- `pnpm-workspace.yaml`: only `packages/*`, `examples/*`, `fixtures/*`. Never `references/**`.
- `tsconfig.base.json` / every package tsconfig: `"exclude": ["**/references/**"]`.
- `biome.json`: `files.ignore: ["references/**"]`.
- Vitest: `exclude: ["**/references/**"]`.
- `.gitattributes`: `references/** linguist-vendored` (keeps GitHub language stats sane).
- Agent tooling: do **not** index or grep `references/` by default; consult it
  deliberately when this document says to, or when stuck on a design question
  the reference solves.

`references/README.md` should reproduce the tables in §1.3 and §1.4 and add: "These are
not part of the build. Do not import from them. Do not copy code without an
attribution comment."

If submodules become annoying in the agent's environment, the fallback is
`scripts/refs.sh` doing `git clone --depth 1` into `references/` with
`references/` in `.gitignore`. Either is acceptable; submodules are preferred.

### 3.4 Bootstrap checklist (Milestone 0)

1. `pnpm init`, workspace file, base tsconfig, Biome, Changesets, CI skeleton.
2. Create every package in §3.2 with `package.json`, `tsconfig.json`,
   `src/index.ts` exporting nothing, and a smoke test. Wire `exports`.
3. Add references (§3.3) and exclusions.
4. `docs/adr/0001-own-wire-protocol.md` … through `0012` from §12, one
   paragraph each, copied from this document.
5. `fixtures/big-contract` generator script + `scripts/ts-perf.ts` (see §11).
6. CI green on an empty repo.

---

## 4. Core concepts and vocabulary

| Term | Meaning |
|------|---------|
| **Contract** | The runtime-free description of the API: procedures, channels, their schemas and errors. Lives in `@cable/contract`. Shared by client and server. |
| **Procedure** | A `query` or `mutation`. Has `input`, `output`, `errors`. Either **global** (runs in the stateless edge handler) or **host-scoped** (declared on a channel; runs inside that channel's host). |
| **Channel** | A parameterized pattern (`chat.{roomId}`) declaring `server` events (host→client), `client` events (client→host), optional `procedures`, `presence` schema, `history` policy. |
| **Channel instance** | A channel with concrete params: `chat.{roomId}` + `{ roomId: 'lobby' }`. |
| **Host** | The durable actor that owns one channel instance. On Cloudflare: one Durable Object. On Rivet: one actor. Identified by a **host key** (`chat:lobby`). |
| **Host interface** | The small runtime-agnostic surface (`Host`, `Connection`, `Storage`, `Schedule`, `Peers`) the engine uses. Adapters implement it. |
| **Engine** | The runtime-agnostic host logic in `@cable/core`: implements `HostHandlers` against a `Host`. Handles frames, event log, resume, presence, timers, host-scoped procedures. |
| **Adapter** | A package implementing `Host` for a runtime and wiring runtime events into `HostHandlers` (`@cable/cloudflare`, `@cable/rivet`, `adapter-memory`, `adapter-node`). |
| **Handler (edge)** | The stateless entrypoint (`createHandler`): authenticates, runs global procedures, routes WebSocket upgrades to hosts. On CF this is the Worker `fetch`. |
| **Grant** | The identity + permissions the edge handler computes for a connection and forwards, signed, to the host. |
| **Attachment** | Small per-connection blob that survives host hibernation (CF `serializeAttachment`, ~2 KB; Rivet `c.conn.state`). |
| **Event log** | Per-host append-only log `ev:<seq>` with monotonic `seq`. Used for resume and history. |
| **seq** | Per-host monotonic event sequence number. Client tracks `since` = last seq seen per host key. |

---

## 5. The contract (`@cable/contract`)

### 5.1 Requirements

- Zero runtime dependencies (types-only dep on `@standard-schema/spec`).
- Importable from browser, Worker, Node, Rivet. No side effects.
- Types must be **shallow**. Avoid deep conditional/recursive types over the
  whole contract. Each procedure/channel is a plain object with phantom type
  parameters; the router is a plain nested object. Inference helpers
  (`InferInput<typeof api.posts.list>`) operate on one node, never the tree.
- `isolatedDeclarations`-friendly if possible.

### 5.2 DSL

```ts
import { c } from '@cable/contract'
import { z } from 'zod'

export const api = c.contract({
  posts: {
    list: c.query({
      input: z.object({ cursor: z.string().optional() }),
      output: PostPage,
      // optional: cacheable GET instead of batched POST
      transport: { method: 'GET', cache: 'public, max-age=30' },
    }),
    create: c.mutation({
      input: NewPost,
      output: Post,
      errors: {
        RATE_LIMITED: z.object({ retryAfter: z.number() }),
        FORBIDDEN: z.void(),
      },
    }),
  },

  chat: c.channel('chat.{roomId}', {
    params: z.object({ roomId: z.string().min(1) }),          // optional; default: all params are string
    server: {                                                  // host → client events
      message: Message,
      typing: z.object({ userId: z.string() }),
    },
    client: {                                                  // client → host events
      send: { input: z.object({ text: z.string().max(2000) }), errors: { MUTED: z.void() } },
      // shorthand: send: z.object({...}) means { input, errors: {} }
    },
    procedures: {                                              // host-scoped, run inside the host
      kick: c.mutation({ input: z.object({ userId: z.string() }), output: z.void(), errors: { FORBIDDEN: z.void() } }),
    },
    presence: z.object({ typing: z.boolean() }),               // optional
    history: { retain: '24h', max: 10_000 },                   // optional; absence = resume window only
  }),
})

export type Api = typeof api
```

Rules:

- Channel pattern params are `{name}` segments separated by `.`; no wildcards in v1.
- `history.retain` accepts `'<n>s' | '<n>m' | '<n>h' | '<n>d'`; `max` caps count.
  Both are retention policies applied by the engine's timer heap.
- Every channel implicitly has the built-in host-scoped procedure
  `history.load({ before?: seq, limit?: number })` when `history` is declared.
- `c.contract` returns the same object with a hidden brand; no wrapping, no
  proxies at the contract level (keeps types cheap).

### 5.3 Errors

```ts
// Built-in codes (mirror HTTP semantics; used for transport-level errors)
type BuiltinCode =
  | 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'TIMEOUT' | 'CONFLICT' | 'PAYLOAD_TOO_LARGE' | 'TOO_MANY_REQUESTS'
  | 'INTERNAL' | 'UNAVAILABLE' | 'PARSE_ERROR' | 'VALIDATION'

// User-declared codes are per procedure / per client event.
// Wire shape:
{ code: string, message?: string, data?: unknown, status: number }
```

Client-side, a failed call rejects with `CableError<Declared>` where
`Declared` is the discriminated union of that procedure's declared errors plus
the builtin codes. `isCableError(err, 'RATE_LIMITED')` narrows `err.data`.

Server-side, handlers throw `new CableError('RATE_LIMITED', { data: { retryAfter: 30 } })`
or return `ctx.error('RATE_LIMITED', {...})`. Undeclared codes are allowed but
typed as `INTERNAL` on the client and logged via `onError`.

---

## 6. Server: procedures (`@cable/core` + edge adapters)

### 6.1 Implementing global procedures

```ts
import { implement } from '@cable/core'
import { api } from '@app/contract'

export const procedures = implement(api)
  .context<{ env: Env; identity: Identity | null }>()   // set by the edge handler
  .use(async ({ ctx, next }) => { /* middleware; may extend ctx */ return next({ ctx: { ...ctx, db: getDb(ctx.env) } }) })
  .procedures({
    posts: {
      list: async ({ input, ctx }) => ctx.db.posts.page(input.cursor),
      create: async ({ input, ctx }) => {
        if (!ctx.identity) throw new CableError('UNAUTHORIZED')
        const post = await ctx.db.posts.insert(input)
        await ctx.hosts.feed({}).emit('created', post)         // publish into a channel host via Peers
        return post
      },
    },
  })
```

Reusable application middleware can name public, protected, and admin
resolvers while retaining that one complete `.procedures()` object:

```ts
const builder = implement(api).context<{ identity: Identity | null }>()
const publicProcedure = builder.procedure
const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (ctx.identity === null) throw new CableError('UNAUTHORIZED')
  return next({ ctx: { identity: ctx.identity } })
})
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.identity.role !== 'admin') throw new CableError('FORBIDDEN')
  return next({ ctx })
})

export const procedures = builder.procedures({
  health: publicProcedure(api.health, () => ({ ok: true })),
  posts: { create: protectedProcedure(api.posts.create, ({ ctx, input }) => ctx.posts.create(input)) },
  users: { remove: adminProcedure(api.users.remove, ({ ctx, input }) => ctx.users.remove(input)) },
})
```

Each resolver captures its own middleware chain and accepts one explicit global
contract leaf. It preserves the leaf's input, output, and declared errors. A
resolved leaf does not add a second dispatcher: the existing runtime invokes
its captured chain once.

- Middleware typing mirrors tRPC's `next({ ctx })` pattern but implemented
  with the shallowest generics that work. Study tRPC's middleware builder for
  the DX, not the implementation.
- `implement(api)` type-checks that every global procedure is implemented
  (missing → compile error) and that host-scoped procedures are **not**
  implemented here (they belong to the host).
- Server-side caller: `procedures.caller(ctx)` for tests/SSR. Has
  `onError` hook (tRPC issue #5413).

### 6.2 Execution (edge handler)

`createHandler(api, procedures, options)` returns `{ fetch(request, env, ctx) }`.

- `POST /_cable/rpc` — batch body `{ calls: [{ id, path, input }] }` → `{ results: [...] }`.
  Individual results carry `ok`/`error` so one failure doesn't fail the batch.
- `GET /_cable/rpc/<path>?input=<json>` — only for procedures with
  `transport.method: 'GET'`; sets `Cache-Control` from the contract.
- `GET /_cable/ws?ch=<channelKey>` (Upgrade) — see §8.
- `POST /_cable/host/<channelKey>/<procedure>` — HTTP fallback for
  host-scoped procedures when the socket isn't open. Authenticates, then
  `Peers.call` into the host.
- Base path configurable (`/_cable` default).
- Input validation via Standard Schema before the handler runs; output
  validation in dev only (configurable).

---

## 7. Server: hosts

### 7.1 The three rules (decided)

1. **The runtime is the source of truth; memory is a cache.** After a
   hibernation wake (CF reruns the DO constructor), every closure is gone.
   Survivors: the sockets, each socket's attachment, and storage. The engine
   must be able to answer any question from `host.connections()` + attachments
   + storage, lazily. Never keep an authoritative in-memory index.
2. **Attachment = identity and pointers; storage = everything else.** The
   attachment holds `{ v, cid, uid?, grants: id[], since?: seq }`. Presence
   payloads, event log, timers → storage.
3. **One alarm.** CF gives one alarm per object. The engine keeps a timer heap
   in storage and always arms the alarm for the earliest entry. Hosts with
   richer schedulers get simpler adapters.

### 7.2 Host interface (decided; `@cable/core/host.ts`)

```ts
export type HostKey = string & { __brand: 'HostKey' }       // "chat:lobby"
export type ConnectionId = string & { __brand: 'ConnectionId' }

export interface HostLimits {
  attachmentBytes: number       // CF ≈ 2048; Rivet: Infinity (still keep attachments small)
  maxFrameBytes: number         // CF: 1 MiB for WS messages
}

export interface Host {
  readonly key: HostKey
  readonly limits: HostLimits
  connections(tag?: string): Iterable<Connection>            // truth after wake; not a cache
  readonly storage: Storage
  readonly schedule: Schedule
  readonly peers: Peers
  waitUntil(p: Promise<unknown>): void
  autoResponse?(request: string, response: string): void     // ping/pong without waking (CF); optional
  now(): number                                              // injectable for tests
}

export interface Connection {
  readonly id: ConnectionId
  readonly tags: readonly string[]                           // immutable after accept: `cid:<id>`, `uid:<userId>`
  readonly attachment: {
    get(): Attachment | undefined
    set(a: Attachment): void                                 // engine guarantees size ≤ limits.attachmentBytes
  }
  send(frame: string | ArrayBuffer): void
  close(code?: number, reason?: string): void
}

export interface Attachment {
  v: 1
  cid: ConnectionId
  uid?: string
  grants: string[]                                           // grant ids, resolved against storage `gr:<id>` if large
  since?: number                                             // last seq the client acked (optional; used for diagnostics)
}

export interface Storage {                                   // KV is the floor; SQL is an optional capability
  get<T>(key: string): Promise<T | undefined>
  getMany<T>(keys: string[]): Promise<Map<string, T>>
  put(key: string, value: unknown): Promise<void>
  putMany(entries: Record<string, unknown>): Promise<void>
  delete(keys: string | string[]): Promise<void>
  list<T>(q: { prefix?: string; start?: string; end?: string; limit?: number; reverse?: boolean }): Promise<Map<string, T>>
  transaction<T>(fn: (tx: Storage) => Promise<T>): Promise<T>
  sql?: (query: string, ...params: unknown[]) => AsyncIterable<Record<string, unknown>>
}

export interface Schedule {                                  // single-alarm model
  set(at: number): Promise<void>
  get(): Promise<number | null>
  clear(): Promise<void>
}

export interface PeerMessage { t: string; [k: string]: unknown }

export interface Peers {                                     // host ↔ host, edge → host
  send(key: HostKey, msg: PeerMessage): Promise<void>        // fire-and-forget
  call<T>(key: HostKey, msg: PeerMessage): Promise<T>        // request/response
}

export interface SignedGrant { payload: string; sig: string } // HMAC over identity + grants + exp + hostKey

export interface HostHandlers {                              // what the engine exposes; adapters call these
  onUpgrade(req: Request, grant: SignedGrant): Promise<
    | { accept: true; tags: string[]; attachment: Attachment }
    | { accept: false; response: Response }>
  onMessage(c: Connection, data: string | ArrayBuffer): Promise<void>
  onClose(c: Connection, code: number, reason: string, wasClean: boolean): Promise<void>
  onError(c: Connection, err: unknown): Promise<void>
  onAlarm(): Promise<void>
  onPeer(msg: PeerMessage): Promise<unknown>
}
```

Notes:

- **No `onWake`.** Eager rebuild on every wake is O(n) attachment reads even
  when one frame arrived. The engine reads what it needs when it needs it.
- **Tags vs attachment.** CF tags are fixed at accept time. Tags carry
  immutable facts (`cid`, `uid`) and enable O(1) `connections('uid:42')`.
  Dynamic state goes in attachment/storage.
- **Concurrency.** Assume single-threaded per host but **not** atomic across
  `await`s. Use `storage.transaction` for read-modify-write (seq increment +
  log append). CF's input/output gates make this cheap; other hosts may not.
- **Storage floor is KV.** Event log and presence use KV in v1. The `sql`
  capability lets the CF adapter later back the log with SQLite indexes
  without changing the engine.

### 7.3 Engine responsibilities (`@cable/core/engine.ts`)

`createEngine(channelContract, impl, host): HostHandlers`

1. **Upgrade.** Verify `SignedGrant` (HMAC key from adapter options; `exp`
   checked; `hostKey` must match `host.key`). Run user `authorize(conn)` if
   present (may throw → 403). Return tags + attachment.
2. **Frames.** Decode per §9. Validate against the contract with Standard
   Schema. Dispatch: `hello` → welcome/replay; `emit` → user `onClient[ev]`;
   `call` → user `procedures[p]`; `presence` → presence update.
3. **Emit (host→client).** `ctx.emit(ev, data)`: validate, `seq = ++seq` and
   append `ev:<seq>` inside one transaction, then broadcast the `ev` frame to
   every connection in `host.connections()`. Optionally `ctx.emitTo(conn|uid, ...)`
   for targeted sends (not logged unless `{ log: true }`).
4. **Event log & retention.** Keys `ev:<seq padded 16>` → `{ ev, d, at }`.
   Retention = `history.retain/max` if declared, else the resume window
   (default `5m` / 1,000 events). Compaction runs from the timer heap.
5. **Resume.** On `hello.since`: if `since >= oldestSeq - 1`, replay
   `(since, current]` in `welcome.replay` (chunk if > `maxFrameBytes`);
   else `welcome.reset = true` and the client refetches via `history.load`.
6. **Presence.** `pr:<cid>` → `{ uid, d, at }`. On `presence` frame: validate,
   store, broadcast diff `{ update: [{ cid, uid, d }] }`. On close: delete,
   broadcast `{ leave: [cid] }`. Sweep timer (every 60s while any `pr:*`
   exists): any `pr:<cid>` whose `cid` is not in `host.connections()` is
   stale → delete + broadcast leave. This handles sockets that die without a
   close event. `welcome.presence` is a full snapshot.
7. **Timer heap.** Keys `tm:<dueMs padded 16>:<id>` → `{ kind, args }`.
   `armAlarm()` = `schedule.set(min due)`. `onAlarm()` pops all due, runs
   them, re-arms. Kinds: `compact`, `presenceSweep`, user timers via
   `ctx.schedule(kind, at, args)` (exposed to host impl).
8. **Host-scoped procedures.** `call` frame or `onPeer({ t: 'call', p, d, identity })`
   → same dispatcher. Results → `res` frame or peer return.
9. **Peers.** `onPeer` handles `{ t: 'emit' }` (edge/other host publishing
   into this channel), `{ t: 'call' }`, `{ t: 'ping' }`.
10. **Hooks.** `onError(err, ctx)`; `onConnect(conn)`, `onDisconnect(conn)`
    (best-effort; do not rely on for correctness).

### 7.4 Storage key layout (engine-owned; adapters never touch)

```
meta:seq                 number          current seq
meta:oldest              number          oldest retained seq
ev:<seq16>               EventRecord     event log
pr:<cid>                 PresenceRecord
tm:<due16>:<id>          TimerRecord
gr:<grantId>             GrantRecord     only if grants exceed attachment budget
```

`<seq16>` / `<due16>` = zero-padded 16-digit decimal so KV `list` sorts
numerically.

### 7.5 Host implementation API (what users write)

```ts
export class ChatRoom extends cloudflareHost(api.chat) {
  authorize = (conn) => {                      // optional; runs in host after grant verification
    if (!conn.grants.includes(`room:${conn.params.roomId}`)) throw new CableError('FORBIDDEN')
  }
  onClient = {
    send: async (ctx, { text }) => {
      if (await ctx.storage.get(`muted:${ctx.identity.userId}`)) throw new CableError('MUTED')
      await ctx.emit('message', { text, from: ctx.identity.userId, at: ctx.now() })
    },
  }
  procedures = {
    kick: async (ctx, { userId }) => {
      if (!ctx.identity.isAdmin) throw new CableError('FORBIDDEN')
      for (const c of ctx.connections(`uid:${userId}`)) c.close(4003, 'kicked')
    },
  }
  onConnect = (ctx) => ctx.emitTo(ctx.conn, 'typing', { userId: '' })   // example only
}
```

`ctx` exposes: `identity`, `conn`, `params`, `emit`, `emitTo`, `connections`,
`storage` (a **namespaced** view — user keys are prefixed `u:` so they can
never collide with engine keys), `schedule`, `peers`, `now`, `error`.

---

## 8. Edge routing, auth, and adapters

### 8.1 Topology (decided)

- **One host instance per channel instance.** `chat:lobby` is its own DO/actor
  with N sockets in it. Fan-out is "send to everyone here" — one wake, N
  writes. Rejected alternatives: host-per-connection (broadcast becomes N peer
  calls) and per-user "session hosts" that aggregate rooms (doubles wakes per
  event, needs cross-host subscription bookkeeping, and CF can't hibernate the
  outbound host→host link).
- **One client, N sockets.** The client opens one socket per host it is
  subscribed to and hides this behind one typed client. With hibernation, idle
  sockets are ~free. Ordering is per host only.
- **Aggregate channels are a pattern, not a transport mode.** When a client
  would need many instances of one family (50 `document.{id}` presence
  channels in a list), design an aggregate channel (`inbox.{userId}`) whose
  host is fed by the others over `Peers`. A `relay` helper for this is
  post-v1.

### 8.2 Authentication (decided)

- Auth happens in the **edge handler**, before any host is touched. Rejected
  upgrades never wake a DO.
- Same-origin browsers: the session cookie the browser already sends on the
  upgrade. Cross-origin: `?token=` short-lived signed token (browsers can't
  set WS headers).
- The edge handler runs the user's `authenticate(req, env) → Identity | null`,
  then `grants(identity, channelKey, params) → string[]` (default: allow if
  identity non-null), builds `SignedGrant` = HMAC-SHA256 over
  `{ identity, grants, hostKey, exp: now + 60s }` with a secret from env, and
  forwards the upgrade to the host with the grant in a header (`x-cable-grant`)
  or, on CF, as a DO RPC argument.
- The host verifies the signature and `exp`, then runs optional `authorize`.
- Credentials never appear in WebSocket frames. The first frame is `hello`.

### 8.3 Cloudflare adapter (`@cable/cloudflare`)

```ts
// wrangler.jsonc
{
  "durable_objects": { "bindings": [{ "name": "CHAT", "class_name": "ChatRoom" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["ChatRoom"] }]
}

// src/hosts/chat.ts
import { cloudflareHost } from '@cable/cloudflare'
export class ChatRoom extends cloudflareHost(api.chat) { /* §7.5 */ }

// src/worker.ts
import { createHandler } from '@cable/cloudflare'
export { ChatRoom } from './hosts/chat'
const handler = createHandler(api, procedures, {
  hosts: (env) => ({ chat: env.CHAT }),                 // channel family → DO namespace binding
  secret: (env) => env.CABLE_SECRET,
  authenticate: async (req, env) => (await getSession(req, env))?.identity ?? null,
  grants: (identity, key, params) => identity ? [`room:${params.roomId}`] : [],
  onError: (err, info) => console.error(err, info),
})
export default { fetch: handler.fetch }
```

`cloudflareHost(channelContract)` returns a `DurableObject` subclass that:

- implements `fetch` (verifies the Upgrade, calls `engine.onUpgrade`, creates
  `WebSocketPair`, `ctx.acceptWebSocket(server, tags)`,
  `server.serializeAttachment(attachment)`, returns 101);
- implements `webSocketMessage`, `webSocketClose`, `webSocketError`, `alarm`
  → the engine handlers;
- exposes a DO RPC method `__cable_peer(msg)` for `Peers`;
- sets `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`;
- implements `Host` over `ctx.getWebSockets(tag)`, `ctx.storage` (KV API +
  `sql` via `ctx.storage.sql` when available), `ctx.storage.setAlarm`, and
  `Peers` via `env.<NS>.idFromName(hostKey).__cable_peer(...)`.

Host key → DO id: `hostKey = `${family}:${params in pattern order joined by ':'}``;
`env.NS.idFromName(hostKey)`. Params are validated by the channel's `params`
schema before deriving the key; reject `:` in param values.

`createHandler` routes (§6.2), and for upgrades: parse `ch`, resolve family +
params, authenticate, build grant, `stub.fetch(request)` with the grant header.
Peers from the edge: `ctx.hosts.<family>(params).emit(...)` → `__cable_peer`.

Tests: `@cloudflare/vitest-pool-workers` running the conformance suite
against a real workerd DO, including a **forced hibernation** test (the pool
exposes a way to run each test in an isolated DO; simulate by constructing a
fresh DO instance over the same storage and asserting resume/presence still
work).

### 8.4 Rivet adapter (`@cable/rivet`)

Verified against Rivet docs (Sept 2026):

- Low-level `onWebSocket(c, websocket)` handler receives a WinterTC-compliant
  `WebSocket`. Hibernation is opt-in via `options.canHibernateWebSocket: true`;
  actors wake on message or close; `open` fires **once**, so per-connection
  data that must survive sleep goes in `c.conn.state` (their attachment
  equivalent; no documented 2 KB limit — still keep it small).
- `c.state` is in-memory, persisted automatically; a low-level KV API exists;
  `c.conns` is a `Map<connId, Conn>`; `c.broadcast`/`conn.send` are for the
  high-level event system and are **no-ops for low-level sockets** — use
  `websocket.send` directly.
- Actor schedule exists (`setTimeout`-like with arbitrary horizon); actor→actor
  via the client inside an actor.
- Rivet has its own gateway: clients can connect directly with a token, or a
  Node/Bun/Hono server can proxy upgrades to `handle.webSocket(path)`.

Mapping: `Host.storage` → Rivet KV; `Connection.attachment` → `c.conn.state`;
`Schedule` → actor schedule (only one entry used); `Peers` → actor client;
socket → the `WebSocket` from `onWebSocket`; tags → engine-side filter over
`c.conns` state.

```ts
export const chatRoom = rivetHost(api.chat, { authorize, onClient, procedures })
// returns actor({ options: { canHibernateWebSocket: true }, onWebSocket, ...})
export const registry = setup({ use: { chatRoom } })
```

`@cable/rivet`'s `createHandler` mirrors CF's for Node/Bun (Hono
`upgradeWebSocket` proxy per Rivet docs). Treat this adapter as **beta** until
the conformance suite is green against Rivet's hibernation (low-level handler
hibernation shipped Nov 2025; verify current behaviour when you get there).

### 8.5 Memory and Node adapters

- `adapter-memory`: `MemoryHost` with an in-process `Storage` (Map),
  `Schedule` (manual clock), `Peers` (registry of hosts), and an in-process
  client transport (`createMemoryLink`). Must support **simulated
  hibernation**: `host.hibernate()` drops all in-memory engine state and
  rebuilds a fresh engine over the same storage and the same sockets. Every
  engine test runs twice: with and without a hibernation between steps.
- `adapter-node`: `NodeHost` on `ws`, one host per key in a `Map`, storage in
  memory or a JSON file, `Schedule` via `setTimeout`. For local dev without
  wrangler. Same `createHandler` shape.

### 8.6 Conformance suite (`@cable/conformance`)

`hostConformance(factory: () => Promise<{ host, connect, hibernate?, advanceTime }>)`
runs against every adapter:

- upgrade accepted/rejected on grant validity and `exp`
- hello/welcome, seq monotonicity, replay window, `reset`
- emit validation errors → typed `res` errors
- presence join/update/leave, stale sweep after hibernation
- timer heap: compaction, single alarm re-armed correctly
- host-scoped procedure over socket and over peers
- attachment size guard
- frame size guard
- hibernation between every pair of steps (if `hibernate` provided)

---

## 9. Wire protocol v1

Full spec lives in `docs/protocol.md` and must stay in sync with
`packages/core/src/protocol/*.test.ts`. JSON text frames. Every frame has `t`.
Unknown `t` → `err PARSE_ERROR` and continue (forward compatibility). `v` is
negotiated in `hello`/`welcome`; the host answers with the highest version it
supports ≤ the client's.

### 9.1 Client → host

| Frame | Shape | Notes |
|-------|-------|-------|
| `hello` | `{ t:'hello', v:1, cid?: string, since?: number, enc?: 'json' }` | Must be the first frame. `cid` = previous connection id to resume identity; `since` = last `seq` seen for this host key. |
| `emit` | `{ t:'emit', id?: string, ev: string, d: unknown }` | Client→host event. If `id` present, host replies `res`. |
| `call` | `{ t:'call', id: string, p: string, d: unknown }` | Host-scoped procedure. |
| `presence` | `{ t:'presence', d: unknown }` | Full self-state; host diffs and broadcasts. |
| ping | literal string `"ping"` | Not JSON. CF auto-response replies `"pong"` without waking. Client sends every 25s when idle. |

### 9.2 Host → client

| Frame | Shape | Notes |
|-------|-------|-------|
| `welcome` | `{ t:'welcome', v:1, cid: string, seq: number, presence: PresenceSnapshot, replay?: EvFrame[], reset?: true }` | `seq` = current head. `replay` may be chunked into several `welcome` frames with `more: true`. |
| `ev` | `{ t:'ev', seq: number, ev: string, d: unknown }` | Logged broadcast. `seq` strictly increasing per host. |
| `evt` | `{ t:'evt', ev: string, d: unknown }` | Targeted, unlogged (`emitTo`). No seq. |
| `res` | `{ t:'res', id: string, ok: true, d?: unknown }` / `{ t:'res', id, ok: false, e: { code, message?, data? } }` | Reply to `emit`(with id)/`call`. |
| `presence` | `{ t:'presence', join?: P[], update?: P[], leave?: string[] }` | Diffs. `P = { cid, uid?, d }`. |
| `err` | `{ t:'err', code: string, message?: string }` | Non-fatal, not tied to a request. |
| `bye` | `{ t:'bye', code: number, reason: string, retry?: number }` | Sent immediately before host-initiated close. `retry` in ms; absent = don't reconnect (e.g., 4003 kicked, 4001 unauthorized). |

Close codes: 4000 protocol error, 4001 unauthorized, 4002 grant expired,
4003 kicked, 4008 too far behind, 4013 payload too large.

### 9.3 Delivery semantics

- At-least-once from the log; the client dedupes on `seq` → exactly-once
  presentation to the app.
- `since` persists client-side per host key (memory; optional
  `sessionStorage`) so a tab reload can resume.
- Ordering guaranteed per host only.
- Host may drop a client that is `> N` frames behind on `send` buffering with
  `bye 4008 retry:1000`; the client reconnects and resumes.

---

## 10. Client (`@cable/client`, `@cable/react`)

### 10.1 Vanilla client

```ts
const client = createClient<Api>({
  url: 'https://api.example.com/_cable',           // or a link array
  links: [batchLink({ maxBatch: 20, maxWait: 10 })],
  auth: { token: () => getToken() },                // cross-origin only; same-origin uses cookies
  ws: { reconnect: { base: 500, max: 30_000, jitter: true }, idleClose: 30_000 },
})

await client.posts.list.query({ cursor })
await client.posts.create.mutate(input)              // throws CableError<'RATE_LIMITED' | 'FORBIDDEN' | Builtin>

const room = client.chat({ roomId: 'lobby' })       // ChannelHandle — refcounted; socket opens on first use
const off = room.on('message', (m) => ...)           // m typed as Message
room.send({ text: 'hi' })                            // fire-and-forget
await room.send({ text: 'hi' }, { ack: true })       // throws CableError<'MUTED' | Builtin>
await room.kick({ userId })                          // host-scoped; socket if open, else HTTP fallback
room.presence.update({ typing: true })
room.presence.self / room.presence.others / room.presence.on(...)
room.status                                          // 'connecting' | 'open' | 'resuming' | 'closed'
room.dispose()                                       // decrement refcount; socket closes after idleClose
```

Socket manager: `Map<HostKey, ManagedSocket>`. Reconnect with exponential
backoff + jitter, honours `bye.retry`, resumes with `since`, re-sends
`presence` self-state after resume, dedupes `ev` by `seq`, surfaces `reset`
as a `room.on('reset')` event. HTTP link: batched POST, GET for
`transport.method: 'GET'` procedures, `Authorization` header when `auth.token`
set. All transport is web-standard (`fetch`, `WebSocket`); no Node deps.

### 10.2 React / TanStack Query

Follow tRPC v11's TanStack Query **options-proxy** pattern (not the old
`useQuery` wrapper hooks) so users keep native TanStack APIs:

```ts
const cable = createCableQuery(client)               // options proxy + hooks

useQuery(cable.posts.list.queryOptions({ cursor }))
useMutation(cable.posts.create.mutationOptions())

const room = useChannel(cable.chat, { roomId })     // subscribe on mount, refcounted
useEvent(room, 'message', (m) => qc.setQueryData(cable.chat.history.load.queryKey({ roomId }), (old) => append(old, m)))
const { self, others, update } = usePresence(room)
const status = useChannelStatus(room)
```

Post-v1 helper: `room.patches(queryKey, reducer)` — first-class "realtime
event patches query cache" glue. Keep the door open in the API.

### 10.3 SSR

- Procedures over HTTP work in SSR/RSC with `client.posts.list.query()`.
- Channels are client-only; `useChannel` must be a no-op on the server and
  connect after hydration.

---

## 11. Effect integration (`@cable/effect`) — phase 3

Core stays Promise-based. Effect is a layer on top:

- `implementEffect(api)` — handlers return `Effect<Output, DeclaredErrors, R>`
  where `DeclaredErrors` is the tagged-error union derived from `.errors()`.
  Undeclared failures become `INTERNAL`. This is the natural home for
  per-procedure typed errors.
- Host implementations: `onClient`/`procedures` returning Effects; `Host`
  provided as a `Layer`; `ctx.emit` as an Effect; user timers as `Schedule`.
- Client: `room.stream('message')` → `Stream<Message>`; procedures →
  `Effect<Output, CableError<Declared>>`.
- Effect Schema works out of the box via Standard Schema in the contract.

Do not start this until the protocol and engine are stable (M2 done), to
avoid redesigning the Effect layer every time the core moves.

---

## 12. Decision log (write these as ADRs in `docs/adr/`)

1. **Own the wire protocol** (not Cap'n Web). Resumable, hibernation-aware
   channels with `seq`/`since` are the core value; awkward to bolt onto an
   object-capability protocol. Cap'n Web remains a possible future transport.
2. **Contract-first.** Fixes backend suck-in, enables portability, and channels
   are contract-shaped anyway (server→client events aren't procedures).
3. **Host-per-channel-instance.** One wake per event; simplest fan-out.
4. **One client, N sockets.** Session-host aggregation rejected as default;
   available as an opt-in pattern via Peers.
5. **Auth in the edge handler, signed grant to host.** Rejected connections
   never wake a host. Credentials never in frames.
6. **Runtime is truth; memory is cache. No eager `onWake`.**
7. **Single-alarm timer heap in storage.**
8. **KV storage floor; SQL optional capability.**
9. **Resume is protocol (default 5m / 1k events); history is opt-in
   retention on the same log; no R2 adapter in v1.**
10. **JSON v1; encoding negotiated in `hello` for later CBOR.**
11. **Standard Schema for validation; Zod v4 in tests.**
12. **Effect is first-class but optional, in its own package, after M2.**

---

## 13. TypeScript performance budget

`fixtures/big-contract/` — generated contract with 200 procedures (mixed
input/output/errors, nested 3 levels) and 40 channels (each 4 server events,
3 client events, 2 procedures, presence). `scripts/ts-perf.ts` runs
`tsc --noEmit --extendedDiagnostics` on a file that imports the contract and
exercises the typed client for every node.

Budget (CI fails above): **Instantiations < 500k** for both programs. The
client program must check in **< 3.0s** and the edge program in **< 2.5s** on
the CI runner. ADR 0025 records the M4 client adjustment. Record baseline at
M1 and tighten. If a change blows the budget, the change is wrong, not the
budget. Compare against tRPC's
`examples/.test/diagnostics-big-router` (in `references/trpc`) to make sure we
are meaningfully better.

---

## 14. Milestones

Each milestone ends with: tests green, changeset added, `docs/` updated,
example (where applicable) runs.

**M0 — Scaffold.** §3.4. Empty packages, references, CI, ADRs, perf fixture generator.

**M1 — Contract + procedures over memory.**
`@cable/contract` DSL and types; `@cable/core` errors, Standard Schema
validation, `implement()`, batch codec; `adapter-memory` in-process link;
`@cable/client` procedure proxy + batch link. Perf baseline recorded.

**M2 — Channels over memory.**
Engine: frames, event log, resume, presence, timer heap, host-scoped
procedures, peers; `MemoryHost` with simulated hibernation; client socket
manager; conformance suite v1. This is the hardest milestone; expect it to
take longest.

**M3 — Cloudflare.**
`@cable/cloudflare` (`cloudflareHost`, `createHandler`, Peers over DO RPC,
auto-response ping); conformance on workerd via vitest-pool-workers;
`examples/chat-cloudflare` (Worker + DO + TanStack Start client).

**M4 — React.**
`@cable/react` options proxy + hooks; example client uses it.

**M5 — Node dev host.** `adapter-node` + `createHandler`; run the example
without wrangler.

**M6 — Rivet.** `@cable/rivet`; conformance against Rivet's driver;
`examples/chat-rivet`.

**M7 — Effect.** `@cable/effect` per §11.

**Post-v1 backlog:** `relay` helper for aggregate channels; `patches` query
glue; CBOR encoding; OpenAPI from contract; `HistoryStore` R2 adapter;
DevTools panel (frame inspector); SQL-backed event log on CF.

---

## 15. Open questions (pick a default, write an ADR, move on)

- **Grant size.** If grants exceed the attachment budget, store under
  `gr:<id>` and keep ids in the attachment. Default: inline up to 1 KB.
- **Presence sweep cadence.** 60s default; make it a channel option.
- **Replay chunk size.** Default 256 KiB per `welcome` chunk.
- **`emit` without `id`** — silently drop validation failures or send `err`?
  Default: send `err VALIDATION` (unsolicited) so the client can log it.
- **Batch link GET dedupe** — do we also support GET batching? Default: no.
- **Idle host lifetime** — none needed on CF (hibernation) or Rivet (sleep);
  Node host: close after 5m idle.
- **Multiple channels per host** — explicitly *not* supported in v1; revisit
  only if the aggregate-channel pattern proves too costly.

---

## 16. Working instructions for the coding agent

1. **Read this document fully before writing code.** Then read §3, §5, §7, §9
   again. Keep it open.
2. **Work milestone by milestone** (§14). Do not start M3 before M2's
   conformance suite passes with simulated hibernation between every step.
3. **Test-first against `MemoryHost`.** Every engine behaviour gets a test
   that passes with and without a hibernation in the middle. If it only
   passes without, the engine is holding authoritative state in memory —
   that is the bug.
4. **Respect package boundaries** (§3.2). `contract` has zero runtime deps.
   `core` has no Node/CF/Rivet imports. Add a lint rule for this in M0.
5. **Keep types cheap.** Run `pnpm ts-perf` after any change to `contract` or
   the client proxy types. If instantiations jump, stop and simplify.
6. **Consult `references/` deliberately**, per the table in §1.3: tRPC for
   builder/middleware DX and the TanStack options-proxy; oRPC for
   contract/`.errors()`/Standard Schema and to compare their hibernation
   plugin with our engine; Effect for `@cable/effect` only. Never import from
   `references/`. Attribute any ported algorithm.
7. **Web standards only** in `core` and `client`: `fetch`, `Request`,
   `Response`, `WebSocket`, `TextEncoder`, `crypto.subtle` (HMAC). No `Buffer`,
   no `ws` outside `adapter-node`.
8. **Protocol changes** require updating `docs/protocol.md`, the codec tests,
   and a changeset, in the same commit.
9. **Write ADRs** for anything in §15 you decide, and for anything this
   document didn't anticipate. One paragraph is enough.
10. **Definition of done per package:** typed public API with TSDoc on every
    export; README with a 30-line usage example; tests; changeset.
11. **When this document conflicts with itself or with reality** (an API in
    Cloudflare/Rivet changed), prefer reality, note the discrepancy in an
    ADR, and flag it to the author. Do not silently redesign.
12. **Do not** build the hosted service, OpenAPI, CBOR, R2, or the Effect
    package before their milestone.

Example commit sequence for M0 → M1 (illustrative, adapt as needed):

```
chore: scaffold pnpm workspace, biome, changesets, base tsconfig
chore: add reference repos as shallow submodules + exclusions
docs: add DESIGN.md, protocol.md skeleton, ADRs 0001-0012
feat(contract): c.contract / c.query / c.mutation / c.channel with tests
feat(contract): inference helpers + big-contract fixture generator
chore: ts-perf script + CI budget
feat(core): CableError, builtin codes, Standard Schema validate()
feat(core): implement() with middleware + caller
feat(core): rpc batch codec
feat(adapter-memory): in-process procedure link
feat(client): createClient procedure proxy + batchLink
test: end-to-end procedures over memory link
```

---

*End of document.*

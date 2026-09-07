# Implementation plan

M0 through M5 are complete. **M6: Rivet adapter and example** remains active
with its hibernation gate unresolved. **M7: Optional Effect integration** is
implemented and passed its isolated local gate under the user's sequencing
exception; it remains private and unpublished. That exception does not weaken,
bypass, or satisfy the M6 gate. M3
passed at `b24677e72d`; CI run `34011847336` confirmed its gate.
M4 passed at `0d188888fa`; CI run `34020413544` confirmed its gate. M5 passed
at `a24545cf3f`; CI run `34023046798` confirmed its gate. No library API
is published. Read [DESIGN.md](DESIGN.md)
for the full requirements; ADRs record explicit amendments. ADR 0014 supersedes
the design's historical submodule setup; follow [the reference guide](../references/README.md).
The user authorized implementation through M7. M6 and M7 may proceed in
parallel under the sequencing exception above; every milestone still requires
its own gate before it is described as complete.

## M0 sequence and acceptance

1. Establish `AGENTS.md`, Claude's import of it, and project-local skills for both
   agents using the Skills CLI. Pin third-party skill/plugin sources and retain
   their licenses. Keep prose guidance separate from code-quality rules.
2. Make reference source available locally, pinned and read-only, with a path guide
   and explicit update commands. Exclude it from builds, linting, formatting,
   dead-code analysis, tests, default searches, and editor auto-imports.
3. Install the explicit Oxlint/Oxfmt stack, anti-slop plugin, Fallow, strict
   TypeScript, Bun, tsdown, Vitest, Changesets, and reproducible CI. Verify guardrails
   with intentional forbidden imports and real built artifact smoke checks.
4. Scaffold the ten packages from the design with private manifests, ESM exports
   (`types` first), declaration builds, and empty source entry points. Enforce
   package dependency direction in both source imports and manifests.
5. Record the original twelve decisions, tooling amendments, protocol draft, and
   a deterministic 200-procedure/40-channel workload. The performance runner must
   state that no real API baseline exists until M1.
6. Run the full local gate, inspect the diff, commit and push directly to `main`
   as authorized, then inspect GitHub Actions. There is no publish or deploy job.

M0 is complete when the setup checks pass and a fresh checkout has documented,
reproducible installation and agent context. Empty packages do not establish runtime
correctness. A green scaffold must never be described as working RPC or channels.

## Implementation milestones

| Milestone | Deliverable                                                                                                             | Required evidence before advancing                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | Contract DSL, typed errors, procedure implementation/caller, HTTP batch codec, memory procedure transport, client proxy | Positive and negative inference tests; input/error/batch behavior; no backend imports in client type program; real perf fixture within its active CI budget |
| M2        | Channel codec, durable event log, resume/reset, presence, timer queue, peers, socket client, shared conformance suite   | Every engine behavior passes normally and across hibernation between steps; transaction, retention, replay, and malformed-frame failures tested             |
| M3        | Cloudflare handler/DO adapter and chat example                                                                          | Shared conformance against workerd; fresh-instance storage/socket reconstruction; signed-grant rejection before accept; running example                     |
| M4        | React hooks and TanStack Query options proxy                                                                            | Mount/unmount/refcount, native query options, hydration and SSR behavior; updated example                                                                   |
| M5        | Node development host                                                                                                   | Same conformance and handler behavior; deterministic shutdown/idle cleanup; example without Wrangler                                                        |
| M6        | Rivet adapter and example                                                                                               | Verify current Rivet source/docs and install its skills; conformance with real driver and hibernation; beta until green                                     |
| M7        | Optional Effect integration                                                                                             | Effect error/environment inference, Layers, Streams and interruption/resource ownership; no Effect dependency in core                                       |

Within M1, implement the contract and inference tests first, then procedure runtime,
then memory transport and client; measure types as soon as the real proxy exists.
Within M2, establish codec/Host/storage invariants first, then the event log and resume,
then presence/timers/peers, and finally reconnect/client conformance. These are
sequential dependencies, not permission to build later milestone scaffolding APIs.

Each milestone updates docs and includes changesets for public package behavior.
Before publication, choose a project license, verify npm scope ownership, review
packed artifacts and supported runtimes, and enable publication deliberately.

## Decisions to settle at implementation boundaries

Use DESIGN section 15 defaults unless evidence requires another documented choice.
Before M2 codec work, resolve ambiguities in the design together with protocol tests:

- `welcome.more` appears in prose but is absent from the frame shape. Specify replay
  chunk completion and when a client may advance its durable cursor.
- `reset` is described as both a frame and a welcome flag. Choose one canonical wire
  representation and align the client event name with it.
- Define replay/live-event interleaving, invalid/future cursors, resumed connection ID
  ownership, handshake timeout, and presence snapshot ordering.
- Error wire shapes differ between section 5.3 (`status`) and section 9 (`e`).
  Specify which transport carries status and keep the codec strict.
- Define the signature's exact byte encoding and destination canonicalization before
  implementing grants; test expiry, tampering, wrong host, and ambiguous keys.

The design's concrete third-party paths, limits, and hibernation-testing claims must
be verified against pinned source and current official documentation at each adapter
milestone. Record discrepancies rather than treating handoff prose as an API guarantee.

## Deferred setup

The Blume documentation-site plan is in [documentation.md](documentation.md). Add its
runtime and site only when executable public API examples exist. The current docs
remain ordinary Markdown. Cloudflare/Rivet SDKs, React, Effect, and deployment secrets
are introduced with their milestone, not as unused root dependencies in M0.

## M1 acceptance

Bun 1.4.0 frozen installation and both CI jobs pass at `187bbde0`.
The quality gate includes 85 tests, declaration builds, strict lint, type checks,
architecture boundaries, and Fallow. Node 22 compatibility passes separately.
The real 200-procedure/40-channel fixture records 261,723 instantiations and
1.93s on CI with Node 24.16, within the unchanged budgets. ADRs 0018 and 0019
record benchmark scope and shallow contract provenance checks.

HTTP and memory tests cover typed errors, schema transformations, batching,
opt-in GET, and malformed transport results. Channel contracts exist;
channel execution and sockets are the current milestone.

## M2 local acceptance

The combined local test suite passes 185 tests, including 32 shared Host conformance
cases and 10 public-client integration cases run both normally and with
hibernation between steps. Coverage includes grant rejection, replay/reset,
presence, durable timer retries, private targeted history, oversized payloads,
failed writes, reconnect, and disposal. Fallow checks dead code, duplication, and complexity before push. The expanded real channel-client fixture measures
310,351 instantiations and 0.47 seconds locally; CI verification is pending.

## M3 acceptance

The complete local quality gate passes with 204 root tests, 13 Cloudflare unit
tests, and 50 workerd tests with 2 expected native socket-send-fault skips.
The workerd suite imports the built Cloudflare entry and runs shared conformance
through forced Durable Object eviction. The chat integration smoke starts an
isolated local Worker and verifies two-client delivery, presence, history,
global RPC, and HTTP host fallback. The TanStack Start example builds both its
client and SSR output. The type-performance programs measure 310,351 client
instantiations in 0.46 seconds and 235,460 edge instantiations in 0.31 seconds.
CI run `34011847336` passed the Node 22 compatibility job and full quality gate.

## M4 acceptance

`@cablejs/react` provides native TanStack Query options and React channel hooks.
The chat example uses both, including an SSR-scoped `QueryClient`. The local
quality gate passes 226 root tests, 13 Cloudflare unit tests, 46 workerd tests
with 2 expected native socket-send-fault skips, and the chat integration smoke.
The type-performance programs measure 320,097 client instantiations in 0.57
seconds and 235,460 edge instantiations in 0.29 seconds. CI verification is
passed at `0d188888fa` in run `34020413544`. CI measured 320,097 client
instantiations in 2.63 seconds and 235,460 edge instantiations in 1.62 seconds.
ADR 0025 keeps both programs below 500,000 instantiations, sets the M4 client
check-time limit to 3.0 seconds, and keeps the edge limit at 2.5 seconds. M5
is active.

## M5 acceptance

`@cablejs/adapter-node` now exposes a Node HTTP and WebSocket handler with a
per-handler in-memory registry. Its runtime evicts idle engines after five
minutes while retaining in-memory storage and scheduled work for that handler.
The chat example has a Node launcher and Vite proxy that run without Wrangler.
The ordinary Node conformance matrix, public handler checks, and Node smoke
pass. The full local gate passed 258 root tests with 1 expected skip, 13
Cloudflare unit tests, 46 workerd tests with 2 expected skips, both chat
integration smokes, Fallow, and type-performance baselines. CI verification
passed at `a24545cf3f` in run `34023046798`; M6 is active.

## Accepted follow-up: composable server procedure groups

This accepted scope is implemented and remains pending the full M6 gate. ADR
0028 defines reusable application `public`, protected, and admin procedure
resolvers inside the existing complete `.procedures({ ... })` assembly. Each
resolver applies its middleware to one explicit contract leaf, with context
refinement through the current middleware `next({ ctx })` rule.
Authentication remains adapter context setup and authorization remains
application middleware; the contract does not acquire server policy.

Implementation must retain complete global-procedure coverage, reject duplicate
or channel paths, preserve leaf input/output/error inference, and keep the
existing 200-procedure/40-channel type fixture and limits unchanged. Type and
runtime regressions plus `bun run ts-perf` have passed; the feature does not
advance M6 until its full gate passes.

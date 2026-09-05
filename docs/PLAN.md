# Implementation plan

M0 and M1 are complete. The current milestone is **M2: channels over memory**. No library API is published. Read [DESIGN.md](DESIGN.md)
for the full requirements; ADRs record explicit amendments. The user authorized
implementation through M7, but each milestone must pass its gate before work starts
on the next one.

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

| Milestone | Deliverable                                                                                                             | Required evidence before advancing                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | Contract DSL, typed errors, procedure implementation/caller, HTTP batch codec, memory procedure transport, client proxy | Positive and negative inference tests; input/error/batch behavior; no backend imports in client type program; real perf fixture <500k instantiations and <2.5s on CI |
| M2        | Channel codec, durable event log, resume/reset, presence, timer queue, peers, socket client, shared conformance suite   | Every engine behavior passes normally and across hibernation between steps; transaction, retention, replay, and malformed-frame failures tested                      |
| M3        | Cloudflare handler/DO adapter and chat example                                                                          | Shared conformance against workerd; fresh-instance storage/socket reconstruction; signed-grant rejection before accept; running example                              |
| M4        | React hooks and TanStack Query options proxy                                                                            | Mount/unmount/refcount, native query options, hydration and SSR behavior; updated example                                                                            |
| M5        | Node development host                                                                                                   | Same conformance and handler behavior; deterministic shutdown/idle cleanup; example without Wrangler                                                                 |
| M6        | Rivet adapter and example                                                                                               | Verify current Rivet source/docs and install its skills; conformance with real driver and hibernation; beta until green                                              |
| M7        | Optional Effect integration                                                                                             | Effect error/environment inference, Layers, Streams and interruption/resource ownership; no Effect dependency in core                                                |

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

The combined local gate passes 180 tests, including 32 shared Host conformance
cases and 10 public-client integration cases run both normally and with
hibernation between steps. Coverage includes grant rejection, replay/reset,
presence, durable timer retries, private targeted history, oversized payloads,
failed writes, reconnect, and disposal. Fallow reports no dead-code, duplication,
or complexity findings. The expanded real channel-client fixture measures
310,351 instantiations and 0.47 seconds locally; CI verification is pending.

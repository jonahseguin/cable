# Working on cable

`cable` is a TypeScript library for contract-first procedures and durable,
typed channels on actor runtimes. M0 through M3 are complete. M4 is active.
M3 passed at `b24677e72d`; CI run `34011847336` confirmed its gate.
Package entry points remain placeholders until their milestone is implemented.
Never describe a planned API as available.

## Start here

1. Read `docs/DESIGN.md` in full before changing code, then use `docs/PLAN.md`
   for the current execution order and [`references/README.md`](references/README.md)
   for pinned research material. Direct user instructions have precedence. The
   design follows, as amended by accepted ADRs; the plan cannot override it.
   In particular, ADR 0014 supersedes the design's historical submodule setup.
2. Work only in the assigned milestone from section 14. Later milestones are
   context, not scope. Record an open decision in `docs/adr/` before relying on
   it; one short decision with its reason is enough. Raise contradictions
   instead of silently redesigning them.
3. Check `git status` before editing. Preserve unrelated work. This repository
   is often changed by several agents at once.

## Architecture boundaries

- Dependency direction is `contract <- core <- adapters/client/effect`,
  `client <- react`, and `core <- conformance`.
- `@cable/contract` has no runtime dependencies. Its only allowed package is
  the type-only `@standard-schema/spec` dependency.
- `@cable/core` and `@cable/client` use web APIs. Node, Cloudflare, and Rivet
  APIs belong in their adapter packages. `ws` belongs only in `adapter-node`.
- `references/` is read-only research material. Follow
  [`references/README.md`](references/README.md) for pins and updates. Do not
  import from it, include it in tooling, or search it by default. Attribute any
  non-trivial port with its source path and license. For Sock8's unfinished,
  non-authoritative snapshot and licensing caveat, read
  [`docs/sock8-reference.md`](docs/sock8-reference.md).
- Runtime state is authoritative; process memory is a cache. Channel behavior
  must survive a new engine instance over the same sockets and storage.
- Keep public types shallow. Infer one contract node at a time; never recurse
  over an entire contract tree. Run `bun run ts-perf` after contract or client
  proxy type changes.

## Implementation standard

- Prefer the smallest complete API that satisfies the current milestone.
  Avoid compatibility aliases, speculative extension points, and wrappers
  around a single call.
- Parse untrusted values once at a boundary with Standard Schema. Preserve the
  resulting type evidence. Do not widen known values and cast them back later.
- Avoid type assertions. When an assertion is unavoidable, place a precise
  `SAFETY:` comment immediately above it and name the invariant that was
  checked.
- Make invalid states hard to represent with focused types and explicit state
  transitions. Keep protocol and storage versioning visible.
- Comments explain invariants, ownership, wire compatibility, or a surprising
  constraint. Delete narration that repeats the code.
- Keep diffs focused. Delete superseded code and dead exports in the same
  change. Do not add dependencies when a small local implementation is clear.
- Public exports need useful TSDoc. Document behavior, failure modes, and
  ownership; do not restate the signature.

Oxlint includes the vendored `anti-slop` rules. Treat a failure as evidence of
a design or boundary problem first. Use a narrow exception only when the code
documents a real invariant that the rule cannot see. The Effect-specific rule
set stays disabled until M7.

Use the project-local `fallow` skill for dead-code, duplication, architecture,
or changed-code audits. Agent commands use JSON and quiet output. Never run its
watch mode, enable telemetry, or apply a fix before reviewing a dry run.

## Tests and verification

- Test observable behavior and failure paths. Package smoke tests may load the
  built package and verify its export conditions and declarations. Do not add
  assertions about intentionally empty exports, snapshots of incidental
  formatting, or module mocks.
- Use real dependency seams and the memory host. From M2 onward, every engine
  behavior runs both normally and with hibernation between steps.
- A bug fix needs a regression test that fails for the original cause.
- Run the narrowest relevant check while iterating. Before handoff, run
  `bun run check`; run `bun run ts-perf` when public type machinery changed. Report
  commands you could not run and why.
- Protocol changes update `docs/protocol.md`, codec tests, and a changeset in
  the same change. Public package behavior changes require a changeset; setup,
  tests, and internal refactors do not need an empty one.

## Milestone gates

- M0 creates tooling, references, empty packages, ADRs, and the performance
  fixture. It does not implement product APIs or use fake tests to make CI green.
- M1 implements contracts and procedures over memory.
- M2 implements channels and the hibernation-tested engine.
- Cloudflare (M3), React (M4), Node (M5), Rivet (M6), and Effect (M7) wait for
  their prerequisite milestone to pass.
- OpenAPI, CBOR, archival history, hosted services, and other post-v1 ideas
  remain out of scope unless the user explicitly changes the plan.

## Writing

Use plain, specific prose in documentation, READMEs, changesets, and release
notes. Apply the project-local `unslop` skill when editing prose. Keep claims
tied to code that exists and examples that run. `docs/documentation.md`
records the later Blume site plan.

# Working on cable

`cable` is a TypeScript library for contract-first procedures and durable,
typed channels on actor runtimes. Describe only APIs backed by the current
source and tests; never present a planned API as available.

## Start here

1. Read the relevant package and public documentation before changing code.
   Direct user instructions have precedence. Record an open decision in the
   nearest public design or maintenance document before relying on it.
2. Work only in the assigned scope. Do not weaken, bypass, or relabel an
   unresolved gate. Raise contradictions instead of silently redesigning them.
3. Check `git status` before editing. Preserve unrelated work. This repository
   is often changed by several agents at once.

## Architecture boundaries

- Dependency direction is `contract <- core <- adapters/client/effect`,
  `client <- react`, and `core <- conformance`.
- `@cablejs/contract` has no runtime dependencies. Its only allowed package is
  the type-only `@standard-schema/spec` dependency.
- `@cablejs/core` and `@cablejs/client` use web APIs. Node and Cloudflare APIs
  belong in their adapter packages. `ws` belongs only in `adapter-node`.
- External research is read-only context. Do not import it or include it in
  tooling. Attribute any non-trivial port with its source path and license.
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
documents a real invariant that the rule cannot see.

Use the project-local `fallow` skill for dead-code, duplication, architecture,
or changed-code audits. Agent commands use JSON and quiet output. Never run its
watch mode, enable telemetry, or apply a fix before reviewing a dry run.

## Tests and verification

- Test observable behavior and failure paths. Package smoke tests may load the
  built package and verify its export conditions and declarations. Do not add
  assertions about intentionally empty exports, snapshots of incidental
  formatting, or module mocks.
- Use real dependency seams and the memory host. Engine behavior should run
  both normally and with hibernation between steps where the adapter supports it.
- A bug fix needs a regression test that fails for the original cause.
- Run the narrowest relevant check while iterating. Before handoff, run
  `bun run check`; run `bun run ts-perf` when public type machinery changed. Report
  commands you could not run and why.
- Protocol changes update `docs/protocol.md`, codec tests, and a changeset in
  the same change. Public package behavior changes require a changeset; setup,
  tests, and internal refactors do not need an empty one.

## Agent quality gate

The tracked native hooks run `bun run check` before a changed Claude or Codex
session completes. A successful result applies only to the exact repository
content checked. If the hook reports an unverified state, report that failed
check as the blocker and do not call the work verified.

## Writing

Use plain, specific prose in documentation, READMEs, changesets, and release
notes. Apply the project-local `unslop` skill when editing prose. Keep claims
tied to code that exists and examples that run.

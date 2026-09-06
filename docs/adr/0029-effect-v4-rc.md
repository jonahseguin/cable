# ADR 0029: Effect v4 release-candidate integration

Status: accepted, 2026-09-06.

## Decision

`@cable/effect` targets `effect` 4.0.0-rc.112, the current npm release-candidate
tag. It declares `effect` as a package dependency and keeps `@cable/core` free
of Effect.

The pinned Effect reference is also `4.0.0-rc.112`. M7 uses its v4 APIs and
tests only. `effect` 3.22.1 remains npm's stable tag, but v3 compatibility is
out of scope for this package. A legacy package requires its own decision,
implementation, and compatibility matrix.

## Consequences

- `implementEffect` uses v4 `Context.Service`, Layers, and Cause APIs.
- Per-request environments and scopes stay owned by the supplied Layer. Cable
  does not create an ambient runtime or retain fibers between requests.
- Core procedure execution does not expose a request `AbortSignal`. The Effect
  bridge releases scoped resources when an invocation completes, but cannot
  interrupt an in-flight HTTP procedure on client disconnect without a future
  core runtime contract change.
- Effect Schema works through `Schema.toStandardSchemaV1`, so core continues to
  parse contracts at its existing boundary.

## Evidence

- npm `effect` tags checked 2026-09-06: `latest` is 3.22.1 and `rc` is
  4.0.0-rc.112.
- Pinned reference: `references/effect/packages/effect/package.json` is
  `4.0.0-rc.112`.

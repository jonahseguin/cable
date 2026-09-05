# CLAUDE.md

## RivetKit Runtime Boundary

- Keep runtime-neutral byte boundaries as `Uint8Array`/`Vec<u8>` shaped data; Node `Buffer` conversion belongs only in TypeScript NAPI adapter code.
- Keep SQL boundary types explicit and shared across native and wasm adapters; do not derive runtime API contracts from NAPI-only database wrappers.
- Wasm SQLite is remote-only; do not add or imply local SQLite support for wasm builds.
- Keep NAPI and wasm serverless registry lifecycle semantics aligned, including concurrent first-request build and shutdown-during-build behavior.
- Runtime selection should use explicit runtime discriminators such as `runtime.kind`, not concrete adapter class identity.

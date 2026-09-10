# REST and OpenAPI implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional REST endpoints and OpenAPI 3.1.2 generation for annotated global procedures without a second execution path.

**Architecture:** Contract leaves carry frozen data-only `http` metadata. `@cablejs/openapi` compiles those leaves, maps Fetch requests to raw input, and invokes `ImplementedProcedures.execute` once. Core exposes only `EdgeHttpMount<TContext>` so edge adapters can mount the package without importing it.

**Tech Stack:** TypeScript, Fetch API, Standard Schema, Standard JSON Schema, Vitest, Bun workspaces.

**Spec:** `docs/superpowers/specs/2026-09-09-rest-openapi-design.md`

## Global constraints

- Keep `@cablejs/contract` dependency-free except for its existing type-only Standard Schema dependency.
- Keep `@cablejs/core` independent of `@cablejs/openapi`.
- Execute each REST request through the existing runtime once, with `request.signal`.
- Preserve unknown input keys for the procedure schema's strict, strip, or passthrough policy.
- Generate OpenAPI 3.1.2 using input schemas for requests and output schemas for responses.
- Reject unsupported routes or non-convertible schemas. Never emit an unconstrained schema as a fallback.

---

### Task 1: Contract HTTP metadata

**Files:**

- Modify: `packages/contract/src/index.ts`
- Test: `packages/contract/src/index.test.ts`

**Produces:** `HttpProcedureOptions` on global query and mutation contracts. Queries accept `GET`; mutations accept `POST`, `PUT`, `PATCH`, or `DELETE`. Metadata permits a route path, summary, tags, operation ID, security, and success status `200 | 201 | 202`.

- [ ] **Step 1: Write failing metadata tests**

Add declarations that preserve valid frozen metadata and reject query `POST`, mutation `GET`, malformed templates, and status `204`.

- [ ] **Step 2: Run the contract test**

Run: `bun vitest run packages/contract/src/index.test.ts`

Expected: type or runtime failures because `http` is not accepted.

- [ ] **Step 3: Implement only metadata validation and freezing**

Add `http` to the query and mutation definition types, validate its data shape in the existing contract constructors, and preserve it on the branded procedure node. Do not add route traversal or validation execution here.

- [ ] **Step 4: Re-run the contract test and type performance check**

Run: `bun vitest run packages/contract/src/index.test.ts && bun run ts-perf --require-baseline`

Expected: passing metadata tests and no type-performance baseline regression.

### Task 2: Core mount and diagnostic transport

**Files:**

- Modify: `packages/core/src/edge/types.ts`
- Modify: `packages/core/src/edge/handler.ts`
- Modify: `packages/core/src/edge/index.ts`
- Modify: `packages/core/src/diagnostics.ts`
- Modify: `packages/core/src/implementation.ts`
- Test: `packages/core/src/edge/handler.test.ts`
- Test: `packages/core/src/implementation.test.ts`

**Produces:** `EdgeHttpMount<TContext>` with `matches(request)` and `fetch(request, context, policy)`, where the required adapter policy carries `maxBodyBytes`; a fourth optional execution transport argument that can identify REST terminal diagnostics.

- [ ] **Step 1: Write failing edge tests**

Use a mount that records its context. Assert a matching request authenticates and creates context once, a nonmatching request uses the existing router, and the mount receives no unauthenticated request.

- [ ] **Step 2: Run the focused core tests**

Run: `bun vitest run packages/core/src/edge/handler.test.ts packages/core/src/implementation.test.ts`

Expected: failure because the mount type and routing branch do not exist.

- [ ] **Step 3: Add the narrow mount boundary**

Add the public core type and final `createEdgeHandler` mount argument. On a match, build the existing authenticated context once and call `mount.fetch`. Extend the runtime's existing diagnostic event with the supplied `"rest"` transport rather than emitting another event.

- [ ] **Step 4: Re-run focused tests**

Run: `bun vitest run packages/core/src/edge/handler.test.ts packages/core/src/implementation.test.ts`

Expected: edge context and one terminal REST diagnostic tests pass.

### Task 3: Optional package and schema conversion

**Files:**

- Create: `packages/openapi/package.json`
- Create: `packages/openapi/tsconfig.json`
- Create: `packages/openapi/src/schema.ts`
- Create: `packages/openapi/src/schema.test.ts`
- Create: `packages/openapi/src/index.ts`
- Modify: `bun.lock`

**Consumes:** Contract metadata and `ImplementedProcedures` from existing packages.

**Produces:** `resolveJsonSchema(schema, "input" | "output", converter?)` returning draft-2020-12 JSON Schema or throwing a path-specific error.

- [ ] **Step 1: Write failing conversion tests**

Test native Standard JSON Schema input/output selection, converter fallback, and conversion failure. Use a transform whose input schema differs from output schema.

- [ ] **Step 2: Run the focused package test**

Run: `bun vitest run packages/openapi/src/schema.test.ts`

Expected: failure because the package and converter do not exist.

- [ ] **Step 3: Implement the narrow converter boundary**

Accept a Standard JSON Schema instance or one supplied converter. Request only `draft-2020-12`; preserve conversion failures with the contract path. Do not validate request data in this module.

- [ ] **Step 4: Re-run the package test and artifact check**

Run: `bun vitest run packages/openapi/src/schema.test.ts && bun --filter @cablejs/openapi build`

Expected: conversion tests pass and the package builds with only intended exports.

### Task 4: REST route compilation and execution

**Files:**

- Create: `packages/openapi/src/routes.ts`
- Create: `packages/openapi/src/rest.ts`
- Create: `packages/openapi/src/rest.test.ts`
- Modify: `packages/openapi/src/index.ts`

**Consumes:** Plain converted input schemas, metadata, and `EdgeHttpMount<TContext>`. It uses the edge-supplied `maxBodyBytes` with core's bounded body reader.

**Produces:** `createRestHandler(contract, procedures, options): EdgeHttpMount<TContext>`.

- [ ] **Step 1: Write failing route tests**

Cover static-over-parameter precedence, equivalent-template conflict rejection, typed string/number/boolean and repeated-array query decoding, JSON DELETE bodies, extra-key preservation, location collision rejection, request signal propagation, and one transformed runtime execution.

- [ ] **Step 2: Run the focused REST test**

Run: `bun vitest run packages/openapi/src/rest.test.ts`

Expected: failure because no compiled REST mount exists.

- [ ] **Step 3: Compile routes and assemble raw inputs**

Walk global procedures only. Reject conflicts and unsupported shapes at construction. On a request, decode route values using the input schema's wire shape, retain unknown keys, merge body input without overwriting path/query keys, and call `procedures.execute` once with `request.signal` and `"rest"`.

- [ ] **Step 4: Re-run REST and edge tests**

Run: `bun vitest run packages/openapi/src/rest.test.ts packages/core/src/edge/handler.test.ts`

Expected: routing behavior, one execution, and context ownership pass.

### Task 5: OpenAPI document and release material

**Files:**

- Create: `packages/openapi/src/openapi.ts`
- Create: `packages/openapi/src/openapi.test.ts`
- Modify: `packages/openapi/src/index.ts`
- Modify: `docs/public/contracts.md`
- Create: `.changeset/<generated-name>.md`

**Produces:** `createOpenApiDocument(contract, options)` with OpenAPI `3.1.2`, request input schemas, successful output schemas, fixed built-in errors, and default declared-error responses.

- [ ] **Step 1: Write failing document tests**

Assert an exact path operation has input parameters, a JSON request body, an output response, declared default error response, fixed built-in errors, security metadata, and no channel operation.

- [ ] **Step 2: Run the focused document test**

Run: `bun vitest run packages/openapi/src/openapi.test.ts`

Expected: failure because document generation does not exist.

- [ ] **Step 3: Generate the constrained document**

Build only route metadata and compiled schemas into an OpenAPI 3.1.2 document. Reject non-convertible schemas and do not create SDK or UI metadata.

- [ ] **Step 4: Re-run focused tests and review package artifact**

Run: `bun vitest run packages/openapi/src/openapi.test.ts packages/openapi/src/rest.test.ts && bun run release:artifacts`

Expected: document tests pass and the new package has deliberate publication metadata and artifacts.

### Task 6: Final verification

- [ ] **Step 1: Run the full gate**

Run: `bun run check`

Expected: formatting, build, lint, type checks, boundaries, tests, Fallow, type-performance baseline, and docs validation pass.

- [ ] **Step 2: Inspect the package and route diff**

Confirm `@cablejs/openapi` is the only new package, core has no import from it, the lockfile diff is additive, and the public docs state the supported query subset and non-enforcing security metadata.

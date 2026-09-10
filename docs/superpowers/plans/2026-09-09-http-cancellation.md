# HTTP cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cooperative AbortSignal support to HTTP procedure calls without changing the WebSocket protocol.

**Architecture:** Thread an optional execution signal through the runtime call boundary. Keep signal transport-local, group client batches by signal identity, and let HTTP handlers observe the request signal. Preserve existing local timeout and disconnect semantics.

**Tech Stack:** TypeScript, web Fetch API, Vitest, Bun workspaces.

**Spec:** `docs/superpowers/specs/2026-09-09-http-cancellation-design.md`

## Global Constraints

- Do not add WebSocket cancel frames or durable cancellation state.
- Do not promise rollback or exactly-once behavior after cancellation.
- Keep direct callers and in-process links compatible by making the signal optional.
- Run `bun run ts-perf` when public client types change.

---

### Task 1: Runtime signal propagation

**Files:**

- Modify: `packages/core/src/rpc.ts`
- Modify: `packages/core/src/implementation.ts`
- Test: `packages/core/src/rpc.test.ts`
- Test: `packages/core/src/implementation.test.ts`

**Interfaces:**

- `RpcRuntime.execute(call, context, signal?)` carries transport metadata.
- `ProcedureHandlerOptions.signal?: AbortSignal` is visible to global handlers.
- HTTP POST and GET pass `request.signal` to runtime execution.

- [ ] **Step 1: Write failing tests**

Add a runtime test whose handler records `options.signal`, then call the HTTP handler with an `AbortController` signal and assert the exact signal is observed. Add a GET case and a direct runtime call asserting the signal may be absent.

- [ ] **Step 2: Run the focused tests and verify failure**

Run `bun vitest run packages/core/src/rpc.test.ts packages/core/src/implementation.test.ts`.
Expected: TypeScript or assertion failures because the runtime does not yet pass a signal.

- [ ] **Step 3: Implement the optional signal path**

Add the optional third argument to the runtime interface and implementation. Pass it from `handlePost`, `handleGet`, and `executeIndependently` without including it in encoded calls. Thread it into middleware invocation and handler options.

- [ ] **Step 4: Run focused tests**

Run the same Vitest command and the core typecheck. Expected: all focused tests pass.

### Task 2: Client options and signal-aware batches

**Files:**

- Modify: `packages/client/src/client.ts`
- Modify: `packages/client/src/batch-link.ts`
- Modify: `packages/client/src/get-request.ts`
- Modify: `packages/client/src/link.ts`
- Test: `packages/client/test/batch-link.test.ts`
- Test: `packages/client/test/client.test.ts`

**Interfaces:**

- `ProcedureCallOptions` contains `signal?: AbortSignal`.
- Procedure calls accept `(input, options?)`; void-input calls use `(undefined, options?)`.
- `PendingCall` carries a local signal only; the JSON `RpcCall` remains unchanged.

- [ ] **Step 1: Write failing tests**

Test that two calls sharing one signal use one fetch request and receive that signal. Test that calls with different signals use separate requests. Test an already-aborted signal makes no request and rejects with its abort reason. Test an in-flight abort settles the client promise and does not schedule a retry.

- [ ] **Step 2: Run client tests and verify failure**

Run `bun vitest run packages/client/test/batch-link.test.ts packages/client/test/client.test.ts`.
Expected: the new call options do not typecheck or the fetch requests do not carry signals.

- [ ] **Step 3: Implement signal-aware client calls**

Extract options from the second procedure argument, preserve the signal outside `RpcCall`, reject already-aborted calls before enqueueing, and group queued calls by signal identity. Pass each group signal to POST fetch and pass GET signals directly. Preserve existing response correlation and error conversion.

- [ ] **Step 4: Run focused client tests and typecheck**

Run the same Vitest command, `bun --filter @cablejs/client typecheck`, and `bun --filter @cablejs/client ts-perf` if the package exposes it. Expected: all tests and typechecks pass.

### Task 3: Documentation and release metadata

**Files:**

- Modify: `docs/public/client.md`
- Modify: `docs/public/reliability.md`
- Create: `.changeset/<http-cancellation>.md`

- [ ] **Step 1: Document the real contract**

Show a procedure call with `{ signal }`, explain signal-group batching, and state that cancellation is cooperative and does not roll back a committed write. State that existing socket timeout/disconnect behavior is unchanged.

- [ ] **Step 2: Add a client package changeset**

Mark `@cablejs/client` as a patch release and describe optional HTTP AbortSignal support. Do not add a changeset for core unless the package release policy requires the public handler option to be versioned separately; if required, use a patch entry for `@cablejs/core`.

- [ ] **Step 3: Validate docs and metadata**

Run the relevant client/core tests, docs validation, and the repository check before handoff.

### Task 4: Final verification

**Files:**

- No additional files.

- [ ] **Step 1: Run the repository gate**

Run `bun run check`, including `bun run ts-perf` because public client types changed.

- [ ] **Step 2: Inspect the final diff**

Confirm no WebSocket protocol files, adapter runtime files, or unrelated diagnostics files changed. Confirm the working tree contains only the approved cancellation implementation, tests, docs, plan/spec, and changeset.

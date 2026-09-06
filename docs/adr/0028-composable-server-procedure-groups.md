# ADR 0028: Composable server procedure groups

Status: implemented, pending the M6 full gate, 2026-09-06.

## Decision

Keep `implement(contract)` as the complete, single-builder API and retain its
one `.procedures({ ... })` assembly step. Extend its context-bound builder with
a per-leaf `procedure` resolver. The resolver accepts the explicit contract
leaf and its handler, and `.use()` returns another resolver whose middleware
applies only to leaves resolved through it.

Applications define `publicProcedure`, `protectedProcedure`, and
`adminProcedure` from that resolver. Core does not define identities, roles, or
authentication policy.

```ts
const procedures = implement(api).context<AppContext>();

export const publicProcedure = procedures.procedure;

export const protectedProcedure = procedures.procedure.use(async ({ ctx, next }) => {
  if (ctx.identity === null) {
    throw new CableError("UNAUTHORIZED");
  }
  return next({ ctx: { ...ctx, identity: ctx.identity } });
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.identity.role !== "admin") {
    throw new CableError("FORBIDDEN");
  }
  return next({ ctx });
});
```

The existing `.procedures()` receives its complete, plain contract-shaped
object. A resolved leaf carries its selected middleware into the one runtime;
an ordinary handler remains a public procedure.

```ts
export const appProcedures = procedures.procedures({
  health: publicProcedure(api.health, () => ({ ok: true })),
  posts: {
    create: protectedProcedure(api.posts.create, ({ ctx, input }) => ctx.posts.create(input)),
  },
  users: {
    remove: adminProcedure(api.users.remove, ({ ctx, input }) => ctx.users.remove(input)),
  },
});
```

The plain object may be assembled from imported leaf handlers in separate
modules; no router merging API is added. Existing `.procedures()` completeness
continues to require every global procedure exactly once and exclude channel
and host-scoped procedures. The resolver only accepts a global contract leaf
from the implementation's contract and preserves that leaf's input, output,
and declared-error inference.

Resolver inference is shallow: it infers one supplied
`AnyProcedureContract` leaf. It must not form a recursive
`GlobalProcedure<TTree>` union over the entire contract. A resolver's handler
context must be compatible with the initial adapter context or with the context
produced by its captured middleware.

`procedure` is a callable resolver on `ProcedureBuilder`. It captures that
builder's middleware array; its `.use()` appends to that captured array. The
implementation builds one path registry. A registry entry carries either the
builder's existing middleware array for a plain handler or the resolved leaf's
captured array, never both. It then uses the existing input parsing, handler
invocation, output validation, error conversion, transport metadata, and caller
path. It must not construct a second dispatcher or executable group.

TypeScript's structural types cannot prove that an explicit leaf belongs at its
object path. Collection therefore checks reference identity between the resolved
leaf and the contract leaf at that path before installing it in the registry.

## Middleware and authorization

Adapters authenticate a request and provide the initial context. Application
middleware performs authorization and may replace or refine that context with
`next({ ctx })`. A middleware failure skips downstream middleware and the
handler; a successful `next` may run once only. This retains the current
single-execution invariant and applies input validation before middleware and
output validation after the handler.

`public`, `protectedProcedure`, and `adminProcedure` are application names.
The contract remains a runtime-free description of inputs, outputs, and typed
errors; it does not carry server authentication or role policy.

## Consequences

- **Small public surface:** Export the existing builder's focused procedure
  resolver type only if declarations require it. Do not add a factory, routers,
  router merge helpers, built-in role middleware, or a separate server
  execution API.
- **Type tests:** Prove nullable-to-authenticated context refinement, further
  admin refinement, plain-object assembly across modules, exact handler
  input/output inference, and compile errors for a wrong contract leaf or
  channel path. Existing completeness checks cover missing paths.
- **Runtime tests:** Prove selected middleware order, one execution path,
  `next`-twice rejection, validation ordering, and caller/error behavior.
- **Type budget:** Keep group types shallow at one contract node at a time.
  Run `bun run ts-perf` without changing its 200-procedure/40-channel fixture
  or either active limit; add a focused core declaration measurement only if
  the new public types need one.

## Evidence

- [`implement` and middleware runtime](../../packages/core/src/implementation.ts)
- [`implement` inference tests](../../packages/core/src/implementation.types.test.ts)
- [Design section 6.1](../DESIGN.md#61-implementing-global-procedures)

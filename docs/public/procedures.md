---
title: Implement procedures
description: Attach global procedure handlers to a cable contract with typed context, boundary validation, and declared errors.
---

`implement(contract)` checks that server handlers cover every global procedure. Procedures declared inside a channel belong to that channel's implementation.

```ts
import { c } from "@cablejs/contract";
import { CableError, createRpcHandler, implement } from "@cablejs/core";
import { z } from "zod";

const api = c.contract({
  greeting: c.query({
    input: z.object({ name: z.string() }),
    output: z.string(),
    errors: { BLOCKED: z.void() },
  }),
});

const procedures = implement(api)
  .context<{ requestId: string }>()
  .procedures({
    greeting: ({ input }) => {
      if (input.name === "blocked") {
        throw new CableError("BLOCKED");
      }
      return `Hello, ${input.name}`;
    },
  });

const rpc = createRpcHandler(procedures, {
  context: () => ({ requestId: crypto.randomUUID() }),
});

export default { fetch: rpc.fetch };
```

## Validation and errors

cable parses input before middleware and handlers run. It validates output by default, including schema transformations. Set `validateOutput: false` only when handlers already return the output schema's parsed type.

Handlers can throw `CableError` with one of the procedure's declared codes. Unknown thrown values and undeclared codes become sanitized `INTERNAL` failures, and cable reports them to `onError`.

## Reuse authorization middleware

`builder.procedure` resolves one explicit global contract leaf. Its `.use()` method captures middleware for leaves resolved through that value. Keep the complete contract-shaped object in the single `.procedures()` call.

```ts
import { c } from "@cablejs/contract";
import { CableError, implement } from "@cablejs/core";
import { z } from "zod";

const app = c.contract({
  health: c.query({ input: z.void(), output: z.object({ ok: z.literal(true) }) }),
  posts: {
    create: c.mutation({
      input: z.object({ title: z.string().min(1) }),
      output: z.object({ id: z.string() }),
    }),
  },
});

interface PostService {
  create(input: { title: string }): { id: string } | Promise<{ id: string }>;
}

const builder = implement(app).context<{
  identity: { role: "admin" | "member" } | null;
  posts: PostService;
}>();

const publicProcedure = builder.procedure;
const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (ctx.identity === null) {
    throw new CableError("UNAUTHORIZED");
  }
  return next({ ctx: { ...ctx, identity: ctx.identity } });
});

export const procedures = builder.procedures({
  health: publicProcedure(app.health, () => ({ ok: true })),
  posts: {
    create: protectedProcedure(app.posts.create, ({ ctx, input }) => ctx.posts.create(input)),
  },
});
```

The resolver accepts a global procedure leaf, never a channel. A resolved leaf runs its captured middleware once. `next({ ctx })` retains the `posts` service while refining `identity` from nullable to authenticated.

Read [authorization](/authorization) for a focused context-refinement example, [organize procedures](/organizing-procedures) to split handlers across files, or [channel procedures](/channel-procedures) for calls that run inside one channel host.

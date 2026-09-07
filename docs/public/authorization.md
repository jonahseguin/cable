---
title: Authorize procedures
description: Build request context at the adapter boundary, then refine it with reusable application middleware.
---

cable does not define users, roles, or sessions. Your adapter authenticates the request and provides the initial context. Application middleware decides which procedures can use that context.

```ts title="procedures.ts"
import { c } from "@cablejs/contract";
import { CableError, implement } from "@cablejs/core";
import { z } from "zod";

const api = c.contract({
  health: c.query({ input: z.object({}), output: z.object({ ok: z.literal(true) }) }),
  account: c.query({
    input: z.object({}),
    output: z.object({ id: z.string(), email: z.string().email() }),
  }),
  users: {
    remove: c.mutation({ input: z.object({ userId: z.string() }), output: z.object({}) }),
  },
});

interface Identity {
  readonly id: string;
  readonly role: "admin" | "member";
}

interface AppContext {
  readonly identity: Identity | null;
}

const builder = implement(api).context<AppContext>();
export const publicProcedure = builder.procedure;
export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (ctx.identity === null) throw new CableError("UNAUTHORIZED");
  return next({ ctx: { identity: ctx.identity } });
});
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.identity.role !== "admin") throw new CableError("FORBIDDEN");
  return next({ ctx });
});

export const procedures = builder.procedures({
  health: publicProcedure(api.health, () => ({ ok: true })),
  account: protectedProcedure(api.account, ({ ctx }) => ({
    email: `${ctx.identity.id}@example.com`,
    id: ctx.identity.id,
  })),
  users: { remove: adminProcedure(api.users.remove, () => ({})) },
});
```

The adapter builds `AppContext` for each request. `protectedProcedure` turns its nullable `identity` into `Identity` for downstream handlers. `adminProcedure` narrows the role further. Those names are application conventions, so use names that fit your policy.

Every resolved procedure still appears once in the complete object passed to `.procedures()`. See [organize procedures](/organizing-procedures) when that object grows beyond one module.

---
title: Authorize procedures
description: Build request context at the adapter boundary, then refine it with reusable application middleware.
---

cable does not define users, roles, or sessions. Your adapter authenticates the request and provides the initial context. Application middleware decides which procedures can use that context.

Authentication happens before cable resolves a global procedure or channel operation. The adapter's `authenticate` callback receives the original `Request` and returns your identity or `null`. Put session-cookie or bearer-token verification there. A `null` identity can still call procedures you intentionally expose as public, but it cannot open a channel or call a channel procedure through the edge.

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

## Connect authentication to the edge

The handler owns the authentication boundary. This example leaves session verification in your application because cable cannot know your cookie format, token issuer, or session store.

```ts title="worker.ts"
import { createHandler } from "@cablejs/cloudflare";
import { api } from "./api.js";
import { procedures } from "./procedures.js";

interface Identity {
  readonly userId: string;
  readonly role: "admin" | "member";
}

declare function authenticateSession(request: Request, env: Env): Promise<Identity | null>;

export const handler = createHandler(api, procedures, {
  authenticate: authenticateSession,
  context: ({ identity }) => ({ identity }),
  credentials: { mode: "bearer" },
  grantSecret: (env) => env.CABLE_GRANT_SECRET,
  hosts: (env) => [{ channel: api.chat, namespace: env.CHAT_HOSTS }],
});
```

`authenticateSession` is the application seam. Replace the declaration with the session verifier used by your service. The `credentials` mode tells cable which credential transport to accept and, for cookie credentials, which browser origins may open a socket. It does not validate the credential for you.

The same authentication callback runs for RPC, channel host calls, and WebSocket upgrades. A channel socket does not receive the caller's authorization header or cookie. Cable authenticates at the edge, then sends the host a short-lived signed grant.

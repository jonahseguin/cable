---
title: Organize procedures across files
description: Share one contract and one implementation builder while keeping procedure handlers in focused modules.
---

Keep the contract and builder in dependency roots. Leaf modules import them. One final module assembles the complete procedure-shaped object. This direction prevents a handler from importing the module that imports it.

```ts title="api.ts"
import { c } from "@cablejs/contract";
import { z } from "zod";

export const api = c.contract({
  health: c.query({ input: z.object({}), output: z.object({ ok: z.literal(true) }) }),
  account: c.query({ input: z.object({}), output: z.object({ id: z.string() }) }),
});
```

```text
api.ts <- procedure-builder.ts <- procedures/health.ts
                              <- procedures/accounts.ts
api.ts <- procedures/index.ts <- procedure-builder.ts, procedures/*
```

```ts title="procedure-builder.ts"
import { CableError, implement } from "@cablejs/core";

import { api } from "./api.js";

interface Identity {
  readonly id: string;
}

export const builder = implement(api).context<{
  readonly identity: Identity | null;
  readonly requestId: string;
}>();
export const publicProcedure = builder.procedure;
export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (ctx.identity === null) throw new CableError("UNAUTHORIZED");
  return next({ ctx: { ...ctx, identity: ctx.identity } });
});
```

```ts title="procedures/health.ts"
import { api } from "../api.js";
import { publicProcedure } from "../procedure-builder.js";

export const health = publicProcedure(api.health, () => ({ ok: true }));
```

```ts title="procedures/accounts.ts"
import { api } from "../api.js";
import { protectedProcedure } from "../procedure-builder.js";

export const account = protectedProcedure(api.account, ({ ctx }) => ({
  id: ctx.identity.id,
}));
```

`protectedProcedure` in this example is another exported resolver from the builder module. Its middleware owns the authentication check and supplies a non-null `identity` to `account`.

```ts title="procedures/index.ts"
import { builder } from "../procedure-builder.js";
import { account } from "./accounts.js";
import { health } from "./health.js";

export const procedures = builder.procedures({
  account,
  health,
});
```

Keep the builder module free of handler imports. Keep the assembly module free of middleware definitions. This leaves one complete implementation without a second router or group runtime.

---
title: Call channel procedures
description: Put per-channel operations beside their channel, then call them over its socket or the authenticated HTTP fallback.
---

Global procedures live in `implement(api).procedures(...)`. Channel procedures belong to the `procedures` map inside `c.channel(...)` because they execute in one resolved channel host. The following continuation belongs in the `api.ts` channel definition from [Build channels](/channels).

```ts
import { c } from "@cable/contract";
import { z } from "zod";

// api.ts
export const api = c.contract({
  chat: c.channel("chat.{roomId}", {
    client: {},
    server: { message: z.object({ text: z.string() }) },
    procedures: {
      recent: c.query({
        input: z.object({ limit: z.number().int().min(1).max(100) }),
        output: z.array(z.object({ text: z.string() })),
        errors: { FORBIDDEN: z.void() },
      }),
    },
  }),
});
```

```ts
import { CableError, type ChannelImplementation } from "@cable/core";
import { api } from "./api.js";

interface Identity {
  readonly userId: string;
}

export const chatImplementation = {
  onClient: {},
  procedures: {
    async recent(context, { limit }) {
      if (!context.grants.includes(`room:${context.params.roomId}`)) {
        throw new CableError("FORBIDDEN");
      }
      return Array.from(
        (await context.storage.list<{ text: string }>({ prefix: "message:", limit })).values(),
      );
    },
  },
} satisfies ChannelImplementation<typeof api.chat, Identity>;
```

The handler receives parsed input plus the host's parsed `params`, authenticated `identity`, `grants`, namespaced `storage`, `peers`, and event methods. A socket call also has `connection`; an HTTP fallback does not, so treat it as optional.

```ts
// client.ts
const room = client.chat({ roomId: "general" });
const messages = await room.recent({ limit: 50 });
```

Cable sends this call through an open channel socket when one exists. The edge handler also exposes `POST /_cable/host/<channel-key>/<procedure>` for an authenticated caller without a socket. Both paths validate the same procedure input and invoke the same host implementation.

Use a channel procedure when the operation needs one channel's state, ordering, or membership. Use a global procedure for ordinary request-scoped work. Neither kind inherits authorization from the other: the edge authenticates every request, Cable signs channel grants, and the channel still decides what its identity and grants may do.

`history.load` is reserved by Cable when a channel declares `history`. Do not declare an application procedure with that name.

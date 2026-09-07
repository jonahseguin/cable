---
title: Define a contract
description: Declare global procedures and channel families with Standard Schema validators in one shared API.
---

`@cablejs/contract` defines the shared API without importing server code. It accepts Standard Schema v1 validators, including Zod, Valibot, ArkType, and Effect Schema.

```ts
import { c } from "@cablejs/contract";
import { z } from "zod";

const Message = z.object({
  from: z.string(),
  text: z.string(),
});

export const api = c.contract({
  posts: {
    list: c.query({
      input: z.object({ cursor: z.string().optional() }),
      output: z.object({ ids: z.array(z.string()) }),
      transport: { method: "GET", cache: "public, max-age=30" },
    }),
    create: c.mutation({
      input: z.object({ title: z.string().min(1) }),
      output: z.object({ id: z.string() }),
      errors: { FORBIDDEN: z.void() },
    }),
  },
  chat: c.channel("chat.{roomId}", {
    server: { message: Message },
    client: {
      send: {
        input: z.object({ text: z.string().max(2_000) }),
        errors: { MUTED: z.void() },
      },
    },
    procedures: {
      members: c.query({ input: z.object({}), output: z.number() }),
    },
    presence: z.object({ typing: z.boolean() }),
    history: { retain: "24h", max: 10_000 },
  }),
});
```

## Global procedures

Use `c.query` for reads and `c.mutation` for writes. Each accepts `input`, `output`, and optional declared `errors`. A query may opt into GET transport with `transport.method: "GET"`; the cache value applies to successful responses.

Global procedures live anywhere in the contract tree outside a channel. [Implement procedures](/procedures) covers their server handlers.

## Channels

`c.channel(pattern, definition)` declares one parameterized channel family. The `server` object lists events delivered to clients. The `client` object lists client events and their optional declared errors. `procedures` declares calls scoped to one open channel. `presence` and `history` are optional channel capabilities.

Channel patterns cannot overlap. Contract keys cannot contain `.` or `/`, and channel event names cannot collide with channel-handle members such as `on`, `dispose`, `presence`, or `history`.

## Inference

Inference helpers work on one contract node at a time:

```ts
import type { InferInput, InferServerEvent } from "@cablejs/contract";

type ListInput = InferInput<typeof api.posts.list>;
type MessageEvent = InferServerEvent<typeof api.chat, "message">;
```

Next, [implement procedures](/procedures) against global leaves or read [channel procedures](/channel-procedures) for calls that belong to one channel.

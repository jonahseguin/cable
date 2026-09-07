# @cablejs/contract

`@cablejs/contract` defines procedures and channel families without importing
server code. It accepts any Standard Schema v1 validator, including Zod,
Valibot, ArkType, and Effect Schema.

```ts
import { c, type InferInput, type InferServerEvent } from "@cablejs/contract";
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
    presence: z.object({ typing: z.boolean() }),
    history: { retain: "24h", max: 10_000 },
  }),
});

type ListInput = InferInput<typeof api.posts.list>;
type MessageEvent = InferServerEvent<typeof api.chat, "message">;
```

`c.contract` keeps the original nested object, adds a non-enumerable brand, and
freezes the contract's branch objects after validation. Procedure and channel
nodes expose their schemas as ordinary readonly fields so the core runtime can
validate each boundary once. Inference helpers accept one node at a time and do
not walk the whole contract.

Contract keys cannot contain `.` or `/`. The names `then`, `__proto__`,
`prototype`, and `constructor` are reserved because contract trees back typed
proxies and server-side callers.

Channel patterns in one contract cannot overlap. For example, `chat.{roomId}`
conflicts with both `chat.admin` and `chat.{slug}`. Parameter names also reserve
`then`, `__proto__`, `prototype`, and `constructor` so decoded parameter maps
have unambiguous data properties. Channel client events and procedures must use
distinct names. They cannot use `on`, `onStatus`,
`onError`, `status`, `dispose`, `presence`, `history`, or `then`, which belong to
the client handle. The three object prototype names above are reserved here as
well. Server event name `reset` belongs to the resume lifecycle.

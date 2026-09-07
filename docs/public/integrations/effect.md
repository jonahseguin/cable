---
title: Effect
description: Use Cable procedures, channel handlers, and channel streams as Effect values while the runtime adapter retains ownership.
---

`@cable/effect` adapts Cable callbacks and clients to Effect. It does not change Cable's transport, authentication, or channel lifecycle.

```ts
import { Effect, Layer } from "effect";
import { implementEffect } from "@cable/effect";
import { c } from "@cable/contract";
import { z } from "zod";

const api = c.contract({
  session: {
    whoami: c.query({ input: z.void(), output: z.object({ userId: z.string() }).nullable() }),
  },
  chat: c.channel("chat.{roomId}", {
    client: {},
    server: { message: z.object({ text: z.string() }) },
  }),
});

const procedures = implementEffect(api)
  .context<{ identity: { userId: string } | null }>()
  .procedures({
    session: { whoami: ({ ctx }) => Effect.succeed(ctx.identity) },
  })
  .toCore(Layer.empty);
```

Each procedure invocation gets a fresh Layer scope. Cable releases that scope when the invocation ends.

For channel behavior, `createEffectEngine(channel, implementation, host, options, layer)` adapts an `EffectChannelImplementation` to the adapter's core `Host`. Its `emit`, `emitTo`, and `schedule` methods return Effects; storage and sockets still belong to the runtime adapter.

```ts
import { Effect, Stream } from "effect";
import { createClient } from "@cable/client";
import { effectClient } from "@cable/effect";

const client = effectClient(api, createClient({ contract: api, url: "/_cable" }));
const room = client.chat({ roomId: "general" });
const program = Stream.runForEach(room.stream("message"), (message) =>
  Effect.sync(() => console.log(message)),
);
```

The stream owns its event subscriptions for its Effect scope. Closing the scope removes those listeners. Use the ordinary client channel handle when the application needs presence or manual lifecycle control.

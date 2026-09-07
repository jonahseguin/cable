# @cablejs/effect

Effect 4 RC integration for cable procedures, channel handlers, and client
streams. `implementEffect` runs global procedure Effects through a caller-owned
Layer. `createEffectEngine` adapts Effect channel behavior to a core Host and
provides that Host through `Host` for each callback.

Wrap a client with its contract: `effectClient(api, client)`. The explicit
contract keeps the Effect wrapper contract-guided without a second dynamic
client proxy.

`stream` is reserved for the channel Stream method, alongside Cable's other
channel-handle member names. It cannot be used for a channel client event or
procedure.

The package targets `effect` 4.0.0-rc.112 only. See the [Effect integration
guide](../../docs/public/integrations/effect.md) for the supported setup.

## Consume a channel stream

This client points at a running Cable host for the same contract. The finite
`receiveNextMessage` Effect owns its subscription through `Effect.scoped`.
When it completes, fails, or is interrupted, Cable removes that listener. A
shared channel socket stays open for other channel users.

```ts
import { createClient } from "@cablejs/client";
import { c } from "@cablejs/contract";
import { effectClient } from "@cablejs/effect";
import { Effect, Stream } from "effect";
import { z } from "zod";

const api = c.contract({
  room: c.channel("rooms.{roomId}", {
    server: { message: z.object({ text: z.string() }) },
    client: { send: z.object({ text: z.string().min(1) }) },
    procedures: {
      memberCount: c.query({ input: z.void(), output: z.number() }),
    },
  }),
});

const rawClient = createClient({
  contract: api,
  url: "https://api.example.com/_cable",
});
const client = effectClient(api, rawClient);
const room = client.room({ roomId: "general" });

const receiveNextMessage = Effect.scoped(
  Stream.runForEach(Stream.take(room.stream("message"), 1), ({ text }) =>
    Effect.sync(() => console.log(text)),
  ),
);

await Effect.runPromise(room.send({ text: "Hello" }));
const members = await Effect.runPromise(room.memberCount());
await Effect.runPromise(receiveNextMessage);
console.log(`${members} members`);
```

`toCore` owns each Effect scope for one procedure invocation. A request that
ends cannot interrupt an in-flight core procedure because core does not expose
an `AbortSignal` at that boundary.

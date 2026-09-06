# @cable/effect

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

The package targets `effect` 4.0.0-rc.112 only. It remains private and
unpublished. See [the implementation plan](../../docs/PLAN.md).

```ts
const procedures = implementEffect(api)
  .context<RequestContext>()
  .procedures({
    greet: ({ input }) => Effect.succeed(`Hello, ${input}`),
  })
  .toCore(Layer.empty);
```

`toCore` owns each Effect scope for one procedure invocation. A request that
ends cannot interrupt an in-flight core procedure because core does not expose
an `AbortSignal` at that boundary.

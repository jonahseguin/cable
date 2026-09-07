# `@cablejs/core`

`@cablejs/core` runs contract procedures through Standard Schema validation and
exposes the same runtime to server callers, in-memory links, and web-standard
HTTP handlers. It has no Node or Bun runtime dependency.

```ts
import { c } from "@cablejs/contract";
import { CableError, createRpcHandler, implement } from "@cablejs/core";
import { z } from "zod";

const api = c.contract({
  greeting: c.query({
    input: z.object({ name: z.string() }),
    output: z.string(),
    errors: { BLOCKED: z.void() },
    transport: { method: "GET", cache: "public, max-age=30" },
  }),
});

const procedures = implement(api)
  .context<{ requestId: string }>()
  .procedures({
    greeting: ({ input }) => {
      if (input.name === "blocked") throw new CableError("BLOCKED");
      return `Hello, ${input.name}`;
    },
  });

const rpc = createRpcHandler(procedures, {
  context: () => ({ requestId: crypto.randomUUID() }),
});

export default { fetch: rpc.fetch };
```

Input is parsed before middleware or handlers run. Output validation is enabled
by default, including schema transformations. Set `validateOutput: false` only
when handlers already return the output schema's parsed type. Unknown thrown
values and undeclared error codes are reported to `onError` and sent as a
sanitized `INTERNAL` failure.

## Reusable procedure middleware

`builder.procedure` resolves one explicit global contract leaf. Its `.use()`
method captures middleware for leaves resolved through that value. Keep the
complete contract-shaped object in the existing `.procedures()` call.

```ts
const builder = implement(api).context<{
  identity: { role: "admin" | "member" } | null;
}>();

const publicProcedure = builder.procedure;
const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (ctx.identity === null) throw new CableError("UNAUTHORIZED");
  return next({ ctx: { identity: ctx.identity } });
});
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.identity.role !== "admin") throw new CableError("FORBIDDEN");
  return next({ ctx });
});

export const procedures = builder.procedures({
  health: publicProcedure(api.health, () => ({ ok: true })),
  posts: {
    create: protectedProcedure(api.posts.create, ({ ctx, input }) => ctx.posts.create(input)),
  },
  users: { remove: adminProcedure(api.users.remove, ({ ctx, input }) => ctx.users.remove(input)) },
});
```

The resolver accepts a global procedure leaf, not a channel. It preserves that
leaf's input, output, and declared errors. A resolved leaf runs its captured
middleware once; plain handlers run the builder middleware once.

`POST /_cable/rpc` accepts independent batches. Queries explicitly configured
for GET are also available at `GET /_cable/rpc/<path>?input=<json>` and apply
their cache policy only to successful responses. The handler limits POST bodies
to 1 MiB and batches to 100 calls by default; both limits are configurable.

## Durable channels

`createEngine` turns one channel contract and its handlers into the callbacks a
Host adapter invokes. The engine keeps sequence numbers, replay events,
presence, grants, and timers in Host storage. Rebuilding the handlers after
hibernation does not reset channel state.

```ts
import { c } from "@cablejs/contract";
import {
  createEngine,
  type ChannelImplementation,
  type GrantSecret,
  type Host,
} from "@cablejs/core";
import { z } from "zod";

const room = c.channel("rooms.{roomId}", {
  client: {
    send: z.object({ text: z.string().min(1) }),
  },
  procedures: {},
  server: {
    message: z.object({ text: z.string() }),
  },
});

interface Identity {
  readonly userId: string;
}

const implementation: ChannelImplementation<typeof room, Identity> = {
  authorize(context) {
    if (!context.grants.includes("room:read")) {
      throw new CableError("FORBIDDEN");
    }
  },
  onClient: {
    async send(context, input) {
      await context.emit("message", input);
    },
  },
  procedures: {},
};

export function roomHandlers(host: Host, grantSecret: GrantSecret) {
  return createEngine(room, implementation, host, {
    grantSecret,
  });
}
```

The example leaves Host construction to an adapter. The portable engine uses
web APIs and has no Node or Bun runtime dependency. Adapters must preserve
attachments and storage across hibernation, serialize transactions, and route
every callback to the current handler instance.

The first structured client frame must be `hello`; literal ping is allowed while
the handshake is pending. The engine sends presence and retained events in
bounded welcome chunks before it marks the connection ready. Logged events
advance one durable sequence; targeted events join replay only when
`emitTo(..., { log: true })` is set. The built-in `history.load` procedure pages
visible retained events in ascending sequence order.

Timer handlers run from the Host's single durable alarm. A failed timer remains
scheduled for retry. Server events and presence values are encoded and checked
against both live-frame and welcome-chunk limits before the engine commits them,
so an oversized value cannot make future handshakes fail.

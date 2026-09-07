# cable

[![CI](https://github.com/jonahseguin/cable/actions/workflows/ci.yml/badge.svg)](https://github.com/jonahseguin/cable/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@cablejs/contract)](https://www.npmjs.com/package/@cablejs/contract)

End-to-end type safety for APIs and realtime. Define a contract once, implement
it on the server, and use the same types from a client.

## Install

```sh
npm install @cablejs/contract @cablejs/core @cablejs/client zod
```

With Bun, use `bun add` with the same packages. Add an adapter for the runtime
that hosts your server, or [`@cablejs/react`](https://www.npmjs.com/package/@cablejs/react)
for React. The [installation guide](https://www.cablejs.dev/installation/) lists
the smaller package sets for each runtime.

## A typed API and channel

Define procedures and channel events in one contract.

```ts
import { c } from "@cablejs/contract";
import { z } from "zod";

export const api = c.contract({
  profile: c.query({
    input: z.object({ userId: z.string() }),
    output: z.object({ name: z.string() }),
  }),
  chat: c.channel("chat.{roomId}", {
    server: { message: z.object({ author: z.string(), text: z.string() }) },
    client: { send: z.object({ text: z.string().min(1) }) },
  }),
});
```

Implement the procedure and channel on the server.

```ts
import { type ChannelImplementation, implement } from "@cablejs/core";
import { api } from "./api.js";

export const procedures = implement(api)
  .context<{ readonly userId: string }>()
  .procedures({
    profile: ({ ctx, input }) => ({
      name: input.userId === ctx.userId ? "Mina" : "Guest",
    }),
  });

export const chatImplementation = {
  onClient: {
    async send(context, { text }) {
      await context.emit("message", { author: context.identity.userId, text });
    },
  },
  procedures: {},
} satisfies ChannelImplementation<typeof api.chat, { userId: string }>;
```

The client gets typed procedure calls and bidirectional channel events from the
same contract.

```ts
import { createClient } from "@cablejs/client";
import { api } from "./api.js";

const client = createClient({ contract: api, url: "/_cable" });
const profile = await client.profile.query({ userId: "user-1" });
const room = client.chat({ roomId: "general" });
const unsubscribe = room.on("message", (message) => console.log(message.text));

await room.send({ text: `Hello from ${profile.name}` }, { ack: true });
unsubscribe();
room.dispose();
```

## Learn more

- [Quickstart](https://www.cablejs.dev/getting-started/) follows a procedure from contract to client.
- [Contracts](https://www.cablejs.dev/contracts/) explains procedures, inputs, outputs, and channels.
- [Architecture](https://www.cablejs.dev/architecture/) explains clients, hosts, and runtime adapters.
- [Authorization](https://www.cablejs.dev/authorization/) and [grants](https://www.cablejs.dev/grants/) cover request context and access control.
- [Examples](https://www.cablejs.dev/examples/) contains a runnable chat application.

## Contributing

For repository setup, checks, and contribution guidelines, read
[`CONTRIBUTING.md`](CONTRIBUTING.md). The short version for a local checkout is:

```sh
bun install --frozen-lockfile
bun run setup:hooks
bun run check
```

`cable` is released under the [MIT license](LICENSE).

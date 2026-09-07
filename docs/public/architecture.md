---
title: How cable fits together
description: Connect a shared contract to procedure runtimes, channel hosts, and typed clients.
---

cable has four pieces. The contract names operations and validates their values.
The server implements global procedures and channel behavior. A handler binds
those runtimes to requests and upgrades. The client calls the same contract.

## Start with the contract

Keep the contract in a module that both sides can import. Global procedures sit
in the tree. A channel is a parameterized family with its own events and
optional host procedures.

```ts title="api.ts"
import { c } from "@cablejs/contract";
import { z } from "zod";

export const api = c.contract({
  posts: {
    list: c.query({
      input: z.object({}),
      output: z.object({ ids: z.array(z.string()) }),
    }),
  },
  chat: c.channel("chat.{roomId}", {
    client: {
      send: z.object({ text: z.string().min(1) }),
    },
    server: { message: z.object({ text: z.string() }) },
  }),
});
```

The contract does not contain handlers or transport setup. It is the value that
lets each layer share names, schemas, and inferred input and output types.

## Implement global procedures

`implement(api)` starts a global procedure runtime. Call `.context<T>()` to
describe the request context, then `.procedures(...)` to supply every global
handler. Output validation is enabled by default. Pass
`{ validateOutput: false }` only when the handler already guarantees the output
at another trusted boundary.

```ts title="procedures.ts"
import { implement } from "@cablejs/core";

import { api } from "./api.js";

export const procedures = implement(api)
  .context<{ readonly requestId: string }>()
  .procedures({
    posts: {
      list: () => ({ ids: [] }),
    },
  });
```

Middleware belongs on a procedure builder when several handlers share a rule.
Request authentication and channel grants are separate adapter concerns. See
[authorization](/authorization) for that boundary.

## Bind a handler

For a web-standard HTTP runtime, `createRpcHandler` accepts the implemented
procedures and a context factory. Its default base path is `/_cable`; it serves
procedure POST batches at `/_cable/rpc` and accepts up to 100 calls or 1 MiB per
request unless you provide `maxBatchSize`, `maxBodyBytes`, or `basePath`.

```ts title="server.ts"
import { createRpcHandler } from "@cablejs/core";

import { procedures } from "./procedures.js";

const rpc = createRpcHandler(procedures, {
  context: (request) => ({
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
  }),
});

export default { fetch: rpc.fetch };
```

Node and Cloudflare adapters add channel transports to the same edge routing
model. Their public `createHandler(contract, procedures, options)` functions
accept the contract, the global runtime, and adapter options. The required
options include the adapter's credential and grant policy, context factory, and
channel host registrations. Read the adapter guide for the environment-specific
setup.

## Give channels a host

`nodeHost(channel, implementation, options?)` keeps one channel family in a
Node process. Its optional `engine` value supplies core engine settings. The
Node adapter stores channel state in process memory, so a restart drops that
state.

`cloudflareHost(channel, implementation, options)` creates the Durable Object
class for one channel family. Its required options are `grantSecret` and `peer`;
`engine` is optional. Export the returned class and bind it to a Durable Object
namespace. Hibernation lets the host reconstruct runtime state from object
storage, socket attachments, and its object name.

Use a global procedure for request-scoped work. Use a channel procedure or event
when the operation belongs to one channel's state, ordering, or membership.

## Call the contract from a client

`createClient` is lazy. It makes no request until a procedure or channel handle
is used. Pass `contract` for typed procedures and channels. `url` defaults to
`/_cable`; `ws`, `links`, `fetch`, `headers`, and `onError` are optional client
configuration. The default link batches procedure calls. See [Use the client](/client)
for channels and reconnect behavior.

```ts title="client.ts"
import { createClient } from "@cablejs/client";

import { api } from "./api.js";

const client = createClient({ contract: api, url: "/_cable" });
const posts = await client.posts.list.query({});
const room = client.chat({ roomId: "general" });
await room.send({ text: "Hello" });
```

The procedure call goes through the handler's RPC route. The channel handle
opens its socket when the client subscribes, sends an event, or updates
presence. [Build channels](/channels) covers channel lifecycle and durable
state.

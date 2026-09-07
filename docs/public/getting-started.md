---
title: Get started
description: Define one procedure, implement it with request context, and call it from a typed client.
---

This source preview follows one procedure through a contract, a server implementation, and a client. Put the shared contract in a module that both application sides can import.

## Define the contract

```ts title="api.ts"
import { c } from "@cable/contract";
import { z } from "zod";

export const api = c.contract({
  greeting: c.query({
    input: z.object({ name: z.string().min(1) }),
    output: z.object({ message: z.string() }),
  }),
});
```

## Implement it on the server

`context` is your application boundary. The example below supplies an authenticated name; an adapter can derive it from a session, bearer token, or another request credential.

```ts title="server.ts"
import { createRpcHandler, implement } from "@cable/core";

import { api } from "./api.js";

const procedures = implement(api)
  .context<{ readonly name: string }>()
  .procedures({
    greeting: ({ ctx, input }) => ({ message: `Hello, ${input.name} from ${ctx.name}` }),
  });

const rpc = createRpcHandler(procedures, {
  context: () => ({ name: "Cable" }),
});

export default { fetch: rpc.fetch };
```

## Call it from the client

```ts title="client.ts"
import { createClient } from "@cable/client";

import { api } from "./api.js";

const client = createClient({ contract: api, url: "/_cable" });
const greeting = await client.greeting.query({ name: "Mina" });

console.log(greeting.message);
```

The client infers the procedure input and output from `api`. Next, learn how to [define contracts](/contracts), [authorize procedures](/authorization), or run the [chat example](/examples).

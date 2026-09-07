---
title: Welcome
description: End-to-end type safety for APIs and realtime channels.
---

Move fast. Stay in sync.

Define the contract once. Implement it on the server. Call it from a typed client.

```ts
import { c } from "@cablejs/contract";
import { z } from "zod";

export const api = c.contract({
  greeting: c.query({
    input: z.object({ name: z.string() }),
    output: z.object({ message: z.string() }),
  }),
});
```

```ts
import { createClient } from "@cablejs/client";
import { api } from "./api.js";

const client = createClient({ contract: api, url: "/_cable" });
const result = await client.greeting.query({ name: "Mina" });
```

The same contract gives the server and client their types. Add a channel when
the feature needs ordered events, presence, history, or state owned by one
durable host.

## Start here

- [Get started](/getting-started) follows one contract from server handler to client call.
- [How cable fits together](/architecture) explains contracts, runtimes, hosts, and clients.
- [Examples](/examples) points to the runnable chat application and its source files.
- [Define a contract](/contracts) describes global procedures and channel families.
- [Implement procedures](/procedures) connects global procedures to server code.
- [Use the client](/client) calls procedures and opens typed channel handles.

## Choose your next guide

- [Authorization](/authorization) shows context refinement with public, protected, and admin procedures.
- [React](/react) adds cable to a React component tree.
- [Channels](/channels) explains channel keys, events, presence, and history.
- [Cloudflare Durable Objects](/adapters/cloudflare) runs one channel host per Durable Object.

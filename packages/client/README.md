# client

The procedure client imports your shared contract type and calls the portable RPC
runtime through HTTP batches or an in-process link. It never imports server types.

```ts
import { createClient } from "@cable/client";
import type { Api } from "./contract.js";

const client = createClient<Api>({
  url: "https://api.example.com/_cable",
  auth: { token: () => sessionStorage.getItem("token") ?? undefined },
});

const posts = await client.posts.list.query({ limit: 10 });
await client.posts.create.mutate("A new post");
```

Concurrent calls share a POST batch, capped at 20 requests or 10 milliseconds by
default. Use `batchLink({ maxBatch, maxWait })` to change these bounds. A response
must contain exactly one result for each request ID; malformed batches reject all
pending calls. A failed batch does not poison subsequent requests.

Links are factories with isolated state per client. Each returns a handler that
can pass a call to `next` or finish it as a transport. `headers` and `auth.token`
are evaluated for each HTTP batch. `onError` observes a failed procedure call;
throwing in that observer does not replace the original error.

To use a query's declared GET transport, pass `contract: api` in the client
options. This also infers the client type, so an explicit type argument is
optional. Type-only clients use POST because TypeScript erases their transport
metadata. The default base endpoint is `/_cable` for same-origin requests.

Wire inputs, outputs, and error payloads must be JSON-native. Use schema
transforms to produce strings from Dates or other application objects before
serialization. Unsupported values are rejected instead of silently changing type.

Channel sockets, presence, and resume behavior are implemented in M2. This M1
client intentionally exposes only global procedures.

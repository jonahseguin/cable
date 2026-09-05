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

Pass the runtime contract to use channels:

```ts
import { api } from "./contract.js";

const client = createClient({ contract: api, url: "/_cable" });
const room = client.room({ roomId: "general" });
const off = room.on("message", (message) => console.log(message));
await room.send({ text: "Hello" }, { ack: true });
room.presence.update({ name: "Jonah" });
// When the view is no longer needed:
off();
room.dispose();
```

Event names, procedure methods, presence, and history come from your channel
contract. Creating a handle is lazy. Subscribing, publishing an event, or updating
presence opens its socket. Handles for the same canonical channel key share a
connection within one client. Dispose each handle when finished; the last release
closes the socket after 30 seconds, configurable through `ws.idleClose`.

Host procedures use the open socket or fall back to an HTTP POST when disconnected.
An HTTP-only call does not open a socket. Channel HTTP fallback requires an adapter
that serves `/_cable/host/:key/:procedure`; the memory Host supplies the engine and
socket seam for local tests. Credentials are refreshed for each HTTP call and
socket connection. Raw channel parameters travel with requests so schema
transformations run once at each validation boundary.

Reconnect uses exponential backoff. Replay resumes from the last delivered event,
deduplicates sequences, and waits for the final welcome chunk before reporting
`open`. A retained-history gap emits `reset`. Optional `ws.cursors` persists sequence
cursors through a sessionStorage-compatible interface. Presence snapshots commit
only after all welcome chunks arrive; local presence is republished on reconnect.
Acknowledged events and host calls reject if their connection is interrupted;
they are never automatically repeated.

Use `onStatus` to observe `connecting`, `open`, `resuming`, and `closed`, and
`onError` for asynchronous channel errors. Acknowledgement and procedure failures
reject their promises with `CableError`. Observer exceptions cannot break delivery
to other listeners. `ws.createSocket` accepts a browser-compatible socket factory
for deterministic tests or custom transports.

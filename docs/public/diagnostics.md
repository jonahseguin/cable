---
title: Observe operations
description: Record Cable operation timings and connection transitions without exposing request data.
---

Pass one diagnostics observer to each runtime you create. A client observer covers both HTTP procedures and its managed channel sockets. Procedure, edge, and channel-host runtimes are created independently, so each accepts the same observer where it runs.

```ts
import { createClient } from "@cablejs/client";
import type { CableDiagnostics } from "@cablejs/core";

const diagnostics: CableDiagnostics = {
  observe(event) {
    console.log(event.type, event);
  },
};

const client = createClient({ contract: api, diagnostics, url: "/_cable" });
```

```ts
const procedures = implement(api).context<AppContext>().procedures(handlers, { diagnostics });

const chatHost = nodeHost(api.chat, chatImplementation, {
  engine: { diagnostics },
});

const handler = createHandler(api, procedures, { ...edgeOptions, diagnostics });
```

`operation` events are terminal. They include a public operation name, start time, elapsed time, transport, and `ok`, `error`, or `cancelled` outcome. Errors contain only a Cable error code when one exists and a `cable` or `exception` classification. Cancellation means the local caller stopped waiting. It does not prove the server stopped or rolled back a write.

`connection` events report managed socket state changes. A terminal reconnect welcome with a history gap carries `reset: true`. `fault` events cover failures without a terminal operation, such as malformed channel frames and edge authentication failures.

Cable excludes inputs, outputs, channel parameters, canonical host keys, connection IDs, identities, grants, credentials, request URLs and headers, raw errors, messages, stacks, and error data. Do not infer distributed tracing from these events. Cable does not propagate a trace context.

Observers are best-effort. Cable catches a thrown observer error, handles a rejected promise, and does not await asynchronous exporters. Keep synchronous observer work short and queue exporter work outside the request or socket callback.

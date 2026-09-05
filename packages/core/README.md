# `@cable/core`

`@cable/core` runs contract procedures through Standard Schema validation and
exposes the same runtime to server callers, in-memory links, and web-standard
HTTP handlers. It has no Node or Bun runtime dependency.

```ts
import { c } from "@cable/contract";
import { CableError, createRpcHandler, implement } from "@cable/core";
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

`POST /_cable/rpc` accepts independent batches. Queries explicitly configured
for GET are also available at `GET /_cable/rpc/<path>?input=<json>` and apply
their cache policy only to successful responses. The handler limits POST bodies
to 1 MiB and batches to 100 calls by default; both limits are configurable.

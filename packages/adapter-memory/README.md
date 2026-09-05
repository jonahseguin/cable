# adapter-memory

Run procedures in process while retaining the HTTP transport's JSON semantics.
This is useful for integration tests without starting an HTTP server.

```ts
import { createMemoryLink } from "@cable/adapter-memory";
import { createClient } from "@cable/client";
import { c } from "@cable/contract";
import { implement } from "@cable/core";
import { z } from "zod";

const api = c.contract({
  greet: c.query({ input: z.string(), output: z.string() }),
});
const procedures = implement(api)
  .context<{ prefix: string }>()
  .procedures({
    greet: ({ input, ctx }) => `${ctx.prefix}, ${input}`,
  });
const client = createClient<typeof api>({
  links: [createMemoryLink(procedures, () => ({ prefix: "Hello" }))],
});

await client.greet.query("Ada");
```

The context factory runs once per call. Requests and results round-trip through
the same JSON codecs as HTTP, including omitted void inputs and outputs. Declared
errors are preserved; the server runtime sanitizes undeclared errors.

M2 adds the deterministic memory Host, manual clock, storage, sockets, and
hibernation simulation. Those host behaviors are not available in M1.

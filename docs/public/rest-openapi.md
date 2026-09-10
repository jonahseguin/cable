---
title: REST routes and OpenAPI
description: Serve annotated global cable procedures as optional REST endpoints and generate an OpenAPI 3.1.2 document.
---

Install `@cablejs/openapi` when an application also needs REST endpoints or an
OpenAPI document. It works only with global procedures. Channel procedures,
events, and static UI routes are not exposed.

```sh
bun add @cablejs/openapi
```

## Annotate a procedure

Add `http` metadata to a global query or mutation. Queries use `GET`; mutations
use `POST`, `PUT`, `PATCH`, or `DELETE`.

```ts title="api.ts"
import { c } from "@cablejs/contract";
import { z } from "zod";

const api = c.contract({
  posts: {
    read: c.query({
      http: { method: "GET", path: "/posts/{id}", summary: "Read one post" },
      input: z.object({ id: z.string() }),
      output: z.object({ id: z.string(), title: z.string() }),
    }),
  },
});
```

```ts title="server.ts"
import { createHandler } from "@cablejs/adapter-node";
import { implement } from "@cablejs/core";
import { createRestHandler } from "@cablejs/openapi";

const procedures = implement(api)
  .context<{ readonly identity: string | null }>()
  .procedures({ posts: { read: ({ input }) => loadPost(input.id) } });

const mount = createRestHandler(api, procedures);
const handler = createHandler(api, procedures, {
  authenticate: identityFromRequest,
  context: ({ identity }) => ({ identity }),
  credentials: { mode: "bearer" },
  grantSecret: process.env.CABLE_GRANT_SECRET!,
  hosts: [],
  mount,
});
```

The adapter authenticates and builds context before it calls the mount, then
supplies its existing body-size limit. The procedure runtime validates input and
output, runs middleware, handles errors, and records one `"rest"` diagnostic.

## Request shapes

Path placeholders bind same-named object fields. GET fields use ordinary query
parameters: strings, finite numbers, booleans, and repeated scalar arrays.
Mutations read declared fields from an `application/json` body; `DELETE` may
also use a JSON body. Unknown keys are passed to the input validator, so its
strict, strip, or passthrough policy remains authoritative.

Nested query values, unions, records, tuples, and binary values are unsupported.
Use a JSON body for nested input. Use `z.object({})` for an endpoint with no
arguments; `undefined` and `void` input are unsupported REST wire shapes.

## Generate OpenAPI

```ts title="openapi.ts"
import { createOpenApiDocument } from "@cablejs/openapi";

const document = createOpenApiDocument(api, {
  info: { title: "Posts", version: "1.0.0" },
});
```

Serve `document` from an application route such as `/openapi.json`. It has no
handler or authentication side effects.

The generator uses input JSON Schema for parameters and request bodies, and
output JSON Schema for responses. Validators without native Standard JSON
Schema support need the `schema` converter option. Security metadata describes
the document only; application middleware still enforces authentication.

For Valibot, build a converter once and pass the same function to both APIs.

```ts
import { toStandardJsonSchema } from "@valibot/to-json-schema";

const schema = (validator, mode) =>
  toStandardJsonSchema(validator)["~standard"].jsonSchema[mode]({ target: "draft-2020-12" });

const mount = createRestHandler(api, procedures, { schema });
const document = createOpenApiDocument(api, { info: { title: "Posts", version: "1.0.0" }, schema });
```

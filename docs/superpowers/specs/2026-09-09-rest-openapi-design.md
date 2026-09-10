# Proposed REST and OpenAPI design

## Status and scope

This is a draft for review. It proposes optional REST-style endpoints and an
OpenAPI 3.1.2 document for existing global procedures. It does not add an
alternate procedure runtime.

The first release covers global procedures only. It excludes channel lifecycle,
WebSockets, batching, generated SDKs, binary bodies, multipart forms, static UI,
and nested query-object encodings. REST calls are one procedure per request.
Unannotated procedures remain available only through Cable RPC.

The generated document targets [OpenAPI 3.1.2](https://spec.openapis.org/oas/v3.1.2.html)
with JSON Schema draft 2020-12. That fixed version is the source of truth rather
than a moving `latest` URL.

## Proposed package boundary

`@cablejs/openapi` is optional. It owns both route compilation and OpenAPI
generation. `@cablejs/contract` retains data-only metadata and has no new
runtime dependency. `@cablejs/core` does not import the optional package.

The package exposes two construction functions:

```ts
const rest = createRestHandler(contract, procedures, {
  context: async (request) => ({/* application context */}),
  schema: standardJsonSchema,
});

const document = createOpenApiDocument(contract, {
  info: { title: "Example API", version: "1.0.0" },
  schema: standardJsonSchema,
});
```

`createRestHandler` is a web-standard handler. It walks the branded contract,
compiles annotated global procedures, and invokes `procedures.execute` once per
matched request. It passes `request.signal` as the execution signal. It does not
invoke implementation handlers, middleware, validators, authentication, or
diagnostics itself.

For adapter integration, core exports one narrow public boundary:

```ts
interface EdgeHttpMount<TContext> {
  matches(request: Request): boolean;
  fetch(request: Request, context: TContext): Promise<Response>;
}
```

`@cablejs/openapi` exposes `createRestMount`, which returns that type.
`createEdgeHandler` accepts one optional mount as a final argument alongside its
RPC handler. The edge handler keeps ownership of request authentication and
context construction, then supplies the resulting context to the mount. This
avoids an optional-package import or `RestOptions` dependency in core while
making a REST request follow the same authenticated context path as RPC. The
edge handler dispatches only routes registered by the mount; it never falls back
to an unannotated procedure.

The edge integration should call `authenticate` and `context` exactly once for
the selected REST request. The mount receives the original `Request`, context,
and its signal. It returns `undefined` only when no compiled REST route matches,
so the edge handler can continue with its existing RPC, WebSocket, and host
routes.

## Proposed contract metadata

Each global `c.query` or `c.mutation` may include one optional `http` object:

```ts
c.query({
  input: getPostInput,
  output: postOutput,
  http: {
    method: "GET",
    path: "/posts/{postId}",
    summary: "Get a post",
    tags: ["posts"],
    operationId: "getPost",
    security: [{ bearerAuth: [] }],
    successStatus: 200,
    errors: { NOT_FOUND: 404 },
  },
});
```

This is the complete proposed metadata set for the first design pass:

- `method` and `path` define the route.
- `summary`, `tags`, and `operationId` describe the OpenAPI operation.
- `security` documents the operation's security requirement.
- `successStatus` overrides the normal success status of `200`.
- `errors` optionally documents fixed declared-error status mappings.

These fields describe routing and documentation. `security` does not create an
authorization check. Middleware and the adapter context remain the enforcement
point. The declaration must reject duplicate `(method, path)` pairs, duplicate
operation IDs, invalid path templates, and an error mapping for a code not
declared by that procedure.

This draft intentionally does not add descriptions, examples, callbacks,
headers, per-field parameter overrides, or arbitrary OpenAPI escape hatches.
Those can be added only after a concrete API needs them.

## Proposed request and response rules

Path placeholders bind input keys with the same name. For example,
`/posts/{postId}` writes the decoded path segment to `input.postId`. A GET route
writes its remaining input keys from conventional query parameters. A non-GET
route writes its remaining input keys from one `application/json` object body.

The route compiler rejects a placeholder that names no input property, a key
bound from more than one location, unexpected query keys, unexpected body keys,
missing required path parameters, repeated scalar parameters, and unsupported
parameter shapes. Version one supports scalar string, number, and boolean query
parameters plus repeated arrays of those scalars. It rejects nested query
objects, records, tuples, unions that cannot be classified unambiguously, and
binary data at registration time. JSON bodies carry rich nested data.

The route layer decodes percent-encoded path text and conventional query values.
It must not `JSON.parse` every query parameter and must not pre-coerce it with a
runtime schema. The input JSON Schema determines whether a query value is a
string, number, boolean, or repeated array. The layer creates one raw input
object, and the established procedure runtime validates it once. This keeps
input transforms sound: a schema that accepts `"123"` and returns `123` still
receives the string it declared as input.

`undefined` input needs one explicit rule before implementation. The proposed
rule is that a no-input route allows no path, query, or body input. A procedure
whose raw input is a scalar is body-only, with no path or query bindings. This
avoids inventing a merge shape for scalar input.

A successful endpoint returns the validated output as plain JSON with
`successStatus` or `200`. A failed endpoint returns `{ "error": WireError }`
with the status supplied by the existing runtime. This keeps REST response
bodies conventional without changing Cable's error classification, redaction,
or declared-error validation.

The implementation must reuse the runtime's input validation, middleware,
handler call, output validation, JSON boundary check, and declared-error
validation. It must not validate route fragments separately. A REST execution
needs one terminal procedure diagnostic whose transport is `"rest"`; the
runtime should own that event, rather than the mount emitting a second event.

## JSON Schema and OpenAPI conversion

Standard JSON Schema is separate from Standard Schema validation. The optional
package prefers a schema instance implementing
[Standard JSON Schema](https://standardschema.dev/json-schema): it calls
`jsonSchema.input({ target: "draft-2020-12" })` for parameters and request
bodies, and `jsonSchema.output({ target: "draft-2020-12" })` for success
responses. Input and output converters are distinct because transforms can
accept a string and return a number.

Zod 4.2 and later and ArkType 2.1.28 and later provide the interface natively.
Valibot uses the external `@valibot/to-json-schema` conversion package. An
application may instead provide a converter function for a validator that does
not implement the interface. The function must declare whether it converts the
input or output shape and return JSON Schema draft 2020-12.

Conversion is a registration and document-generation requirement, not a
runtime validation fallback. If any routed input, output, or declared-error
schema cannot be represented, construction and document generation fail with a
path-specific error. The package must never replace that schema with `{}` or
`true` silently.

The generator turns route metadata into OpenAPI paths, uses input schemas for
path/query/body descriptions, output schemas for successful responses, and
declared-error schemas for documented failures. It documents built-in failures
with the existing `WireError` representation. A declared error without a fixed,
validated status mapping is documented as a default response rather than being
assigned a guessed HTTP status. Runtime `CableError` statuses remain dynamic.

## Assumptions requiring approval

- REST metadata belongs on global procedure contracts, not channels or host
  procedures.
- GET is allowed only for `c.query`; mutations use body-bearing methods.
- The route compiler may inspect converted input JSON Schema only to classify
  supported parameter shapes. Standard Schema validation remains authoritative.
- `security` is documentation metadata. Applications enforce it through their
  current context and middleware.
- REST output uses plain JSON, while failures use `{ error: WireError }`.

## Proposed implementation phases

1. **Contract metadata and route compiler.** Add the small `http` declaration,
   validate metadata, walk only global procedures, compile route conflicts and
   input bindings, and add type-performance coverage for the shallow metadata
   additions.
2. **Optional package and edge mount.** Build the nonbatched Fetch handler over
   `ImplementedProcedures.execute`, pass request cancellation through it, add a
   generic edge mount seam, and extend the runtime-owned diagnostic transport to
   `"rest"`.
3. **OpenAPI document and public docs.** Generate a fixed OpenAPI 3.1.2
   document from compiled routes, require a sound input/output converter, add
   the changeset, and document both the supported parameter subset and the fact
   that security metadata does not enforce authorization.

## Observable acceptance tests

- An edge-mounted REST request authenticates and builds context once, then sees
  the same middleware result as the corresponding RPC call.
- Input and output transforms each run once. A string-to-number input transform
  receives the original URL string; a transformed output is the REST JSON body.
- Aborting an HTTP request reaches `ProcedureHandlerOptions.signal`, and the
  one terminal diagnostic reports `transport: "rest"` without payload data.
- Registration rejects duplicate routes, duplicate bindings, unknown input
  fields, unsupported nested query shapes, and unrepresentable schemas.
- Generated OpenAPI parameters, request bodies, success responses, errors, and
  declared security match live `curl` calls for Zod, Valibot, ArkType, and
  Effect Schema fixtures where conversion is available.
- `bun run ts-perf` passes after public contract or proxy type changes, and the
  repository gate passes before release.

## Remaining design risks

- JSON Schema cannot always prove the exact object keys accepted by a validator.
  The compiler needs a conservative object-property extractor and must reject
  schemas it cannot classify instead of accepting a route that cannot be mapped
  safely.
- Query strings have no universal representation for every JSON Schema type.
  The scalar and repeated-array subset must remain a hard v1 boundary until a
  concrete nested encoding is specified and documented.
- A declared error may choose its status dynamically at runtime. Fixed OpenAPI
  response entries are correct only when metadata supplies and validates a
  stable mapping; otherwise the document must use a default response.

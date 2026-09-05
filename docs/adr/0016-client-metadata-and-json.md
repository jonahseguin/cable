# 0016: Runtime client metadata and JSON-native procedure values

Status: accepted during M1, 2026-09-05. Clarifies DESIGN sections 5, 6, and 10.

TypeScript erases the type argument in `createClient<Api>`. It cannot tell the
HTTP link which procedures declared GET. Accept an optional shared `contract`
in client options, infer the client from it when provided, and use its transport
metadata to select GET. Type-only clients continue to use POST batches. Passing
the contract imports no backend implementation. The default base path is
`/_cable`, matching the server. GET responses carry one result; the client maps
the server's fixed GET ID to its local request ID.

Protocol v1 transports JSON-native values. Reject Dates, Maps, Sets, BigInts,
functions, symbols, non-finite numbers, cycles, and other values that JSON would
silently alter or omit. Schema transformations may accept raw handler values
and produce JSON-native outputs; the client receives the schema's output type.
A handler returning a non-JSON result fails with INTERNAL without failing other
calls in its batch. Void procedure inputs and outputs remain supported.

Router keys cannot contain path separators or names reserved for Promise
assimilation and prototype machinery. Reject `then`, `__proto__`, `prototype`,
and `constructor` at definition time so the proxy and server caller agree.

Output validation is enabled by default in every environment. The design's
development-only default would skip schema transformations in production and
change the client's observable output type. An explicit `validateOutput: false`
option instead requires already-parsed handler outputs at the type boundary.

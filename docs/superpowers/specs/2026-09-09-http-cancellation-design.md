# HTTP cancellation design

## Goal

Let callers cancel HTTP procedure work cooperatively while keeping current batching, error, and retry semantics honest.

## Scope

This change covers global procedure calls over HTTP POST batches and GET queries. A caller supplies an optional `AbortSignal`; the client passes it to the fetch request, the server passes the incoming request signal to procedure handlers, and handlers may pass it to cancellable work.

WebSocket operation cancellation, durable cancellation records, rollback, and cancellation of server-side peer calls are out of scope. Existing channel timeouts and disconnect behavior remain unchanged.

## API

`ProcedureCallOptions` contains an optional `signal?: AbortSignal`. Procedure clients accept it as a second argument after input. A void-input call passes `undefined` as its input when it needs options.

`ProcedureHandlerOptions` gains an optional `signal?: AbortSignal`. HTTP handlers receive the request signal. Direct server callers and in-process links may omit it.

`RpcRuntime.execute` accepts an optional execution signal after the context. The signal is transport metadata and never enters the JSON wire payload.

## Batching

The batch link groups queued calls by signal identity. Calls without a signal keep the existing batch. Calls sharing one signal may share one request. Calls with different signals use separate requests, so aborting one signal cannot abort an unrelated call. An already-aborted call rejects locally and is never sent.

An aborted fetch rejects every call in its signal group. The server may still finish work if the handler ignores its signal. The client does not retry a cancelled request.

## Semantics

Cancellation is cooperative. A handler must pass the signal to a cancellable dependency or check `signal.aborted` at meaningful boundaries. Cancellation after a durable write or external side effect cannot undo that effect. The client rejects locally with the platform abort error; no new wire error code is added.

The existing `TIMEOUT` error remains a client-side wait deadline. The existing `UNAVAILABLE` error remains the transport failure for a disconnected request. Neither implies that server work stopped.

## Verification

Tests will cover signal propagation through POST and GET, same-signal batching, different-signal isolation, abort-before-send, abort during an in-flight fetch, and cooperative handler observation. Existing channel, Effect, and hibernation behavior must remain unchanged.

## Diagnostics

Cable can send best-effort diagnostics to one supplied observer at each independently constructed runtime boundary. A client observer covers its HTTP links and managed sockets. Procedure runtimes, edge handlers, and channel hosts each receive the same observer through their own options. No global registry or application wrapper combines them.

Operation events are terminal and include a public operation name, Unix start time, elapsed time, transport, and `ok`, `error`, or `cancelled` outcome. A cancellation means only that the local caller stopped waiting. It does not prove server cancellation, rollback, or distributed correlation. Connection events record client socket status transitions and terminal replay reset. Fault events cover errors without a terminal operation.

Events exclude inputs, outputs, identities, grants, credentials, channel parameters, host and connection IDs, request URLs and headers, raw errors, error messages, stacks, and error data. An error event contains only a Cable code when one exists plus a `cable` or `exception` classification. Observer throws and rejected promises are consumed, never awaited, and never sent to `onError`.

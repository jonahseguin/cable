# ADR 0026: Adapter-owned upgrade execution

Status: accepted for M5, 2026-09-06.

`createEdgeHandler` keeps authentication, routing, grant signing, and error
responses portable. It carries adapter-owned execution through an upgrade only:
`EdgeHostTransport<TExecution, TUpgrade>` receives the sanitized request, signed
grant, and exact execution value, then returns `TUpgrade`. `EdgeHandler.fetch`
therefore returns `Response | TUpgrade`. Cloudflare keeps its `Response`
default. Node passes the request-local raw upgrade values and returns `void`
after `ws` completes the native upgrade.

The engine's existing accepted `UpgradeResult` remains two phase. It persists a
pending grant and lets the handshake deadline reclaim it when native socket setup
fails, as ADR 0020 specifies. The edge transport does not fabricate a WebSocket
HTTP response or retain request state outside its execution argument.

# ADR 0017: Channel handshake, resume, and host identity

Status: accepted

## Decision

Protocol v1 assigns a fresh connection ID at host upgrade and never accepts a
client-supplied ID. `hello` carries only the client's per-host event cursor. This
changes the earlier DESIGN draft, which allowed `hello.cid`. Presence exposes
connection IDs, so letting clients reclaim one would make them usable as bearer
credentials.

The host persists each socket phase as `pending`, `resuming`, or `ready`. It
stores full verified claims in `gr:<grantId>` and keeps the pointer in the socket
attachment. One delivery mutex orders welcome snapshots, logged broadcasts,
presence changes, and cleanup. A host closes a socket found in `resuming` after
hibernation, since it cannot prove which chunks reached the client.
Literal ping is a transport liveness message and is valid in every socket
phase. It does not satisfy or extend the durable handshake deadline. Structured
frames must still begin with `hello`. Adapters may answer literal ping with a
host-wide automatic response because it cannot dispatch application work or
change connection state.

Welcome frames chunk both replay and presence under the host byte limit. Chunks
repeat one captured head and connection ID. `more:true` marks nonterminal chunks.
The terminal welcome is the barrier after which live events and presence diffs
may arrive. Clients advance their durable cursor as replay events are presented,
but use the advertised head only after that barrier. An invalid resume cursor
produces `reset:true` at the current head and no replay.

Reset exists only as the welcome flag and becomes a client lifecycle event after
the terminal chunk. Channel result errors contain `code`, optional `message`, and
optional `data`; they omit HTTP status because the socket has no per-call HTTP
response. Procedure HTTP errors keep their status field.

Channel parameter schemas run once at the edge on the raw input carried beside
the requested canonical host key. The edge rejects a derived key mismatch. The
grant stores parsed string parameters, and the host recomputes the key from
those values without rerunning schema transforms. Contract construction rejects
overlapping patterns rather than assigning route priority.

Grants use unpadded base64url and HMAC-SHA256. The authenticated bytes are the
ASCII prefix `cable.grant.v1.` followed by the literal payload. Verification
checks the signature before parsing payload JSON, then checks expiry and host.

## Consequences

Reconnect resumes event delivery but creates a new presence member. A partial
welcome can make cursor progress without exposing a partial presence snapshot.
Chunking bounds normal replay and snapshot memory; a single item larger than a
frame still forces a 4013 close.

Adapters must preserve attachment phase and the grant record across hibernation.
They may expose queued bytes for backpressure, but the core cannot enforce that
limit on adapters without `bufferedAmount`. Failed durable timer callbacks stay
stored and retry instead of disappearing.

Runtime adapters will enforce the browser credential boundary in their own
milestones. Cookie-authenticated WebSocket upgrades require an explicit Origin
allowlist. Cookie-authenticated HTTP procedure and host-call routes require
`application/json` or another explicit CSRF defense. CORS response headers do
not provide either check. Cross-origin bearer-token mode is a separate adapter
configuration and does not inherit same-origin cookie defaults.

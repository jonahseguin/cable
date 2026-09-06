# Wire protocol v1

Status: implemented by the M2 channel codecs in `packages/core/src/channel-protocol.ts`.
JSON text is the only structured encoding in v1. The literal strings `ping` and
`pong` are the only non-JSON frames. The codec rejects binary frames and counts
limits in UTF-8 bytes.

## Channel upgrade and routing

A client upgrades with `GET /_cable/ws?ch=<hostKey>&params=<rawParamsJson>`.
Both query values use normal URL percent encoding. `params` contains the raw
Standard Schema input, not values decoded from the host key.

The edge finds the one channel pattern that can parse `ch`, validates `params`
with that channel's Standard Schema, and derives the host key from the parsed
output. It rejects the request unless the derived key exactly matches `ch`.
Contract construction rejects overlapping patterns, so route selection has no
priority rules.

A host key expands the channel pattern in order, applies RFC 3986 percent
encoding to each literal or parsed parameter segment, and joins the encoded
segments with `:`. For example, `chat.{roomId}` and `{ roomId: 'a:b' }` produce
`chat:a%3Ab`. Decoding rejects malformed escapes, alternate encodings such as
`%61` for `a`, the wrong literal, and the wrong segment count.

The edge sends a short-lived signed grant with the upgrade. The grant payload is
unpadded base64url containing UTF-8 JSON. Its signature is unpadded base64url
HMAC-SHA256 over these exact ASCII bytes:

```text
cable.grant.v1.<literal payload>
```

The host verifies the signature before decoding payload JSON. It then requires
version 1, a future Unix millisecond `exp`, its own `hostKey`, unique nonempty
capabilities, JSON-native identity, and a plain string parameter map. It checks
that the parameters reproduce `hostKey` without running their schema again.
Invalid, expired, and wrong-host grants fail as `UNAUTHORIZED` with a typed
reason.

The host creates a fresh `cid` for every physical socket. A client cannot choose
or reclaim it. Immutable socket tags include `cid:<cid>` and, when present,
`uid:<uid>`. The attachment stores `{ v:1, cid, grantId, phase, since? }`; the
full verified record at `gr:<grantId>` stores identity, grants, parsed params,
expiry, and host key. The host deletes that record when it closes the socket.
This pointer keeps attachments bounded and restores identity after hibernation.

## Client to host frames

Every JSON object rejects unknown keys. Optional `d` means the property may be
absent. Passing `undefined` for that property encodes the absent form used by
void schemas. Encoders reject class instances, cycles, and non-finite numbers.

| Frame      | Shape                                                | Behavior                                                                                               |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `hello`    | `{ t:'hello', v:1, since?: number, enc?: 'json' }`   | Must be the first frame. `since` is the highest event sequence the client presented for this host key. |
| `emit`     | `{ t:'emit', id?: string, ev: string, d?: unknown }` | Sends a named client event. An `id` requests a `res` frame.                                            |
| `call`     | `{ t:'call', id: string, p: string, d?: unknown }`   | Calls a host procedure and always receives a `res` frame.                                              |
| `presence` | `{ t:'presence', d?: unknown }`                      | Replaces this connection's complete presence value.                                                    |
| ping       | literal `ping`                                       | In any phase, the host answers with literal `pong`; it does not satisfy or extend the hello deadline.  |

The accepted socket starts in persisted `pending` phase. It must send `hello`
within 10 seconds. The engine persists the deadline in its timer heap so a
hibernation does not reset it. Except for literal ping, a non-hello frame before
the handshake, a repeated hello, an unsupported version or encoding, or
malformed JSON closes with code 4000. After the handshake, an unknown `t` produces a nonfatal
`{ t:'err', code:'PARSE_ERROR' }` and leaves the socket open.

The Host interface reserves an optional ping/pong auto-response capability.
Adapters may answer literal ping without waking a hibernating host. Since this
response performs no application work, it is deliberately independent of the
persisted handshake phase.

## Host to client frames

`P` below is `{ cid: string, uid?: string, d?: unknown }`. `E` is
`{ t:'ev', seq: number, ev: string, d?: unknown }`.

| Frame      | Shape                                                                               | Behavior                                                                                  |
| ---------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `welcome`  | `{ t:'welcome', v:1, cid, seq, presence:P[], replay:E[], reset?:true, more?:true }` | One bounded snapshot/replay chunk. `more:true` promises another chunk.                    |
| `ev`       | `{ t:'ev', seq, ev, d?:unknown }`                                                   | Logged broadcast with a strictly increasing host sequence.                                |
| `evt`      | `{ t:'evt', ev, d?:unknown }`                                                       | Targeted event that does not advance the durable cursor.                                  |
| `res`      | `{ t:'res', id, ok:true, d?:unknown }` or `{ t:'res', id, ok:false, e }`            | Independent result for one acknowledged emit or call. `e` is `{ code, message?, data? }`. |
| `presence` | `{ t:'presence', join?:P[], update?:P[], leave?:string[] }`                         | A nonempty diff. One `cid` cannot occur twice in a frame.                                 |
| `err`      | `{ t:'err', code, message?:string }`                                                | Nonfatal protocol failure without a request ID.                                           |
| `bye`      | `{ t:'bye', code, reason, retry?:number }`                                          | Final host instruction before close. `retry` is a nonnegative delay in milliseconds.      |
| pong       | literal `pong`                                                                      | Response to literal `ping`.                                                               |

Close codes are 4000 for a protocol error, 4001 for unauthorized, 4002 for an
expired grant, 4003 for a kick, 4008 for a client that must reconnect and resume,
and 4013 for an oversized payload.

## Welcome, resume, and reset

The host serializes replay, presence, broadcasts, and close cleanup through one
rejection-safe delivery mutex. `hello` moves the attachment to `resuming`, then
the engine captures one event head and one presence snapshot. It partitions
both presence and replay across welcome frames. Every chunk repeats the same
`cid`, `seq`, and `reset`; the arrays contain disjoint partitions. Every
nonterminal chunk has `more:true`, and the terminal chunk omits `more`.

The preferred chunk size is 256 KiB and no encoded chunk may exceed the host's
`maxFrameBytes`. Presence is chunked along with replay. If one entry or event
cannot fit, the host closes with 4013. A send or encode failure after a partial
welcome closes the socket. A socket found in persisted `resuming` phase after a
wake also closes, allowing the client to reconnect from the last event it
presented.

For a retained range whose oldest sequence is `oldest` and current head is
`head`:

- No `since` starts at `head` and has no replay.
- `oldest - 1 <= since <= head` replays `(since, head]` in ascending order.
- A cursor older than `oldest - 1` or ahead of `head` resets at `head`.

A reset welcome has `reset:true` and an empty replay in every chunk. Presence may
still require several chunks.

The client applies replay events as each chunk arrives. It deduplicates by
sequence and persists only the highest event it actually presented. It does not
advance to the advertised `seq` until the terminal chunk arrives. The client
assembles the presence partitions separately and replaces its snapshot only at
the terminal chunk. A reset notification also waits for that barrier.

After sending the terminal chunk, the engine persists `ready` before it releases
the mutex. The mutex prevents logged events and presence diffs from reaching the
socket before that terminal frame. The client treats any other host frame during
resume as a protocol error. Once ready, new events follow the captured head and
presence diffs follow the captured snapshot.

Delivery from the log is at least once. Sequence deduplication gives each client
one presentation of a logged event. Ordering is per host only. `since` belongs
to the client and may persist in session storage; it does not acknowledge or
reclaim a previous `cid`.

## Presence, backpressure, and durable work

The first valid presence update creates a join, later values create updates, and
socket cleanup creates a leave. Welcome entries sort by `cid`. The delivery
mutex orders concurrent snapshot and diff work. A durable sweep removes presence
records whose `cid` no longer exists in `host.connections()` and broadcasts the
leave after deletion.

An adapter may expose `Connection.bufferedAmount` as queued bytes. The engine
applies its backpressure byte limit only when that capability exists. It never
treats a queued frame count as bytes.

Runtime memory is a cache. Attachments, storage, live runtime sockets, and the
single durable alarm contain all authoritative state. Timer handlers delete a
timer only after successful completion. A failed callback remains stored and
re-arms the alarm for the configured retry delay.

---

## HTTP procedures

Implemented in M1. POST `/_cable/rpc` accepts
`{ calls: [{ id, path, input }] }` and returns `{ results: [...] }`. Each result
is `{ id, ok: true, data }` or `{ id, ok: false, error }`. An error contains
`code`, HTTP `status`, and optional `message` and `data`. IDs are nonempty strings
and must be unique within a batch. Result order follows request order. A failed
call does not discard successful siblings.

Procedure paths join router segments with `.`. A router segment must therefore
be nonempty and cannot contain `.` or `/`. Contract construction rejects those
keys before the client, HTTP routes, and TanStack query keys can interpret two
different contract trees as the same path.

The default request limits are 1 MiB and 100 calls. The handler bounds streamed
bodies before executing calls. Invalid envelopes fail the request; procedure
validation and handler failures belong to their individual results.

GET `/_cable/rpc/<encoded-dot-path>?input=<encoded-json>` is available only for
queries whose contract declares GET. It returns one result with ID `get`.
Successful responses use the contract's cache policy; errors use `no-store`.
There is no GET batching. Both routes support a configurable base path.

Inputs, outputs, and error payloads use JSON-native values. The codecs reject
cycles, non-finite numbers, class instances, accessors, and other unsupported
values rather than invoke conversion hooks. Missing input/data represents
`undefined` for void procedures. Output schemas validate and transform handler
results by default. Disabling output validation requires handlers to return the
schema's output type. See [ADR 0016](adr/0016-client-metadata-and-json.md).

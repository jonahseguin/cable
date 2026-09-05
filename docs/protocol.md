# Wire protocol v1 — implementation draft

Status: design-only, copied from DESIGN section 9. No codec exists in M0.
Resolve the ambiguities listed in [PLAN.md](PLAN.md) before implementing M2;
then change this spec, codec tests, and a changeset together.

Full spec lives in `docs/protocol.md` and must stay in sync with
`packages/core/src/protocol/*.test.ts`. JSON text frames. Every frame has `t`.
Unknown `t` → `err PARSE_ERROR` and continue (forward compatibility). `v` is
negotiated in `hello`/`welcome`; the host answers with the highest version it
supports ≤ the client's.

### 9.1 Client → host

| Frame      | Shape                                                            | Notes                                                                                                                    |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `hello`    | `{ t:'hello', v:1, cid?: string, since?: number, enc?: 'json' }` | Must be the first frame. `cid` = previous connection id to resume identity; `since` = last `seq` seen for this host key. |
| `emit`     | `{ t:'emit', id?: string, ev: string, d: unknown }`              | Client→host event. If `id` present, host replies `res`.                                                                  |
| `call`     | `{ t:'call', id: string, p: string, d: unknown }`                | Host-scoped procedure.                                                                                                   |
| `presence` | `{ t:'presence', d: unknown }`                                   | Full self-state; host diffs and broadcasts.                                                                              |
| ping       | literal string `"ping"`                                          | Not JSON. CF auto-response replies `"pong"` without waking. Client sends every 25s when idle.                            |

### 9.2 Host → client

| Frame      | Shape                                                                                                          | Notes                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `welcome`  | `{ t:'welcome', v:1, cid: string, seq: number, presence: PresenceSnapshot, replay?: EvFrame[], reset?: true }` | `seq` = current head. `replay` may be chunked into several `welcome` frames with `more: true`.                                |
| `ev`       | `{ t:'ev', seq: number, ev: string, d: unknown }`                                                              | Logged broadcast. `seq` strictly increasing per host.                                                                         |
| `evt`      | `{ t:'evt', ev: string, d: unknown }`                                                                          | Targeted, unlogged (`emitTo`). No seq.                                                                                        |
| `res`      | `{ t:'res', id: string, ok: true, d?: unknown }` / `{ t:'res', id, ok: false, e: { code, message?, data? } }`  | Reply to `emit`(with id)/`call`.                                                                                              |
| `presence` | `{ t:'presence', join?: P[], update?: P[], leave?: string[] }`                                                 | Diffs. `P = { cid, uid?, d }`.                                                                                                |
| `err`      | `{ t:'err', code: string, message?: string }`                                                                  | Non-fatal, not tied to a request.                                                                                             |
| `bye`      | `{ t:'bye', code: number, reason: string, retry?: number }`                                                    | Sent immediately before host-initiated close. `retry` in ms; absent = don't reconnect (e.g., 4003 kicked, 4001 unauthorized). |

Close codes: 4000 protocol error, 4001 unauthorized, 4002 grant expired,
4003 kicked, 4008 too far behind, 4013 payload too large.

### 9.3 Delivery semantics

- At-least-once from the log; the client dedupes on `seq` → exactly-once
  presentation to the app.
- `since` persists client-side per host key (memory; optional
  `sessionStorage`) so a tab reload can resume.
- Ordering guaranteed per host only.
- Host may drop a client that is `> N` frames behind on `send` buffering with
  `bye 4008 retry:1000`; the client reconnects and resumes.

---

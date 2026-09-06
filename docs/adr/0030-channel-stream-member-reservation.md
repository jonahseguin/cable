# ADR 0030: Reserve the channel stream member

Status: accepted, 2026-09-06.

## Decision

`stream` is a reserved channel client-event and procedure name. Cable's Effect
client exposes server-event subscriptions as `channel.stream(name)`, so this
reservation belongs with the existing shared channel-handle member names.

## Consequences

- `c.channel` rejects `stream` in `client` and `procedures` with the same
  explicit validation used for `dispose`, `history`, and `on` members.
- A previously valid contract using `stream` as a client event or procedure is
  rejected when reconstructed. The project is pre-release and has no such
  current contracts.
- The Effect API retains the documented `room.stream("message")` form without
  a runtime collision or an Effect-only alternate namespace.

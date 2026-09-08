# @cablejs/client

## 0.2.0

### Minor Changes

- [`638076d`](https://github.com/jonahseguin/cable/commit/638076d8a4434c68e95c5aebb5bff34b986ddb06) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Expose durable sequence and replay metadata to channel event listeners so clients can merge live events with history without inventing event identities.

### Patch Changes

- Updated dependencies [[`3c9cb53`](https://github.com/jonahseguin/cable/commit/3c9cb5314f36e5701d098ec3e17723ce8f4256e0)]:
  - @cablejs/core@0.2.0

## 0.1.0

### Minor Changes

- [`fb7a0f0`](https://github.com/jonahseguin/cable/commit/fb7a0f052ea2f3be139bbab1a06b78083cf2556b) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add typed channel handles with shared sockets, bounded reconnect and acknowledgements,
  chunked replay, presence snapshots, history, and host procedure HTTP fallback.

- [`6d680ce`](https://github.com/jonahseguin/cable/commit/6d680ceafab14a0fe3ef82898fb838e4a5843333) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add the typed procedure client, bounded HTTP batching with response ID validation,
  and an in-process link that preserves wire serialization and per-call context.

### Patch Changes

- [`799b22e`](https://github.com/jonahseguin/cable/commit/799b22e5fa3291629419f81d96fa817264a9918b) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Release pooled channel resources when the last subscription or operation on a
  channel view settles. Fire-and-forget events remain leased until their socket
  write completes, while cleanup can safely subscribe again on the same handle.

- [`6d680ce`](https://github.com/jonahseguin/cable/commit/6d680ceafab14a0fe3ef82898fb838e4a5843333) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add the contract DSL for typed queries, mutations, and durable channel families.
  Use hidden node and root brands as shallow validation evidence for downstream
  consumers.

- [`3a32e79`](https://github.com/jonahseguin/cable/commit/3a32e796ebaeb32821e4bcb1f929d1b2d99b88d6) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Prevent middleware from executing a mutation twice, sanitize malformed GET results, and
  reject success envelopes returned with failing HTTP statuses.
- Updated dependencies [[`fb7a0f0`](https://github.com/jonahseguin/cable/commit/fb7a0f052ea2f3be139bbab1a06b78083cf2556b), [`6d680ce`](https://github.com/jonahseguin/cable/commit/6d680ceafab14a0fe3ef82898fb838e4a5843333), [`6d680ce`](https://github.com/jonahseguin/cable/commit/6d680ceafab14a0fe3ef82898fb838e4a5843333), [`c866a7a`](https://github.com/jonahseguin/cable/commit/c866a7a1cd0cd082fb226737eab01ab1141904fa), [`3a32e79`](https://github.com/jonahseguin/cable/commit/3a32e796ebaeb32821e4bcb1f929d1b2d99b88d6), [`dbbe1e2`](https://github.com/jonahseguin/cable/commit/dbbe1e21f6a888bff345794d68f11a095ad46b6c)]:
  - @cablejs/contract@0.1.0
  - @cablejs/core@0.1.0

# @cablejs/contract

## 0.1.0

### Minor Changes

- [`6d680ce`](https://github.com/jonahseguin/cable/commit/6d680ceafab14a0fe3ef82898fb838e4a5843333) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add the contract DSL for typed queries, mutations, and durable channel families.
  Use hidden node and root brands as shallow validation evidence for downstream
  consumers.

- [`c866a7a`](https://github.com/jonahseguin/cable/commit/c866a7a1cd0cd082fb226737eab01ab1141904fa) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add Effect 4 RC procedure and durable channel integrations, including Layer-owned
  handler execution, Effect channel output and timer operations, and Effect client
  procedure and Stream wrappers.

  Reserve `stream` as a channel client-event and procedure name for the shared
  Effect Stream API.

### Patch Changes

- [`fb7a0f0`](https://github.com/jonahseguin/cable/commit/fb7a0f052ea2f3be139bbab1a06b78083cf2556b) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add channel frame codecs, portable host interfaces, canonical channel keys, and
  HMAC-signed grants. Reject channel member collisions and overlapping channel
  patterns when contracts are built.

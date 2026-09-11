# @cablejs/core

## 0.2.1

### Patch Changes

- [`5ab7008`](https://github.com/jonahseguin/cable/commit/5ab700825ca6e95f495979ea134cd187e82e3e22) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add privacy-safe diagnostics for procedure and channel operation timing, connection transitions, and runtime faults, plus cooperative AbortSignal support for HTTP procedures and Effect integrations.

- [`11f2c45`](https://github.com/jonahseguin/cable/commit/11f2c45186e023ff50364443926f325bf7a5ad7b) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add optional REST mounts and OpenAPI 3.1.2 generation for annotated global procedures.
- Updated dependencies [[`11f2c45`](https://github.com/jonahseguin/cable/commit/11f2c45186e023ff50364443926f325bf7a5ad7b)]:
  - @cablejs/contract@0.1.1

## 0.2.0

### Minor Changes

- [`3c9cb53`](https://github.com/jonahseguin/cable/commit/3c9cb5314f36e5701d098ec3e17723ce8f4256e0) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Expose a trusted typed host facade for server-side channel procedures and event delivery.

## 0.1.0

### Minor Changes

- [`fb7a0f0`](https://github.com/jonahseguin/cable/commit/fb7a0f052ea2f3be139bbab1a06b78083cf2556b) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add channel frame codecs, portable host interfaces, canonical channel keys, and
  HMAC-signed grants. Reject channel member collisions and overlapping channel
  patterns when contracts are built.

- [`6d680ce`](https://github.com/jonahseguin/cable/commit/6d680ceafab14a0fe3ef82898fb838e4a5843333) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add typed Cable errors, Standard Schema procedure validation, middleware context
  composition, server callers, portable RPC batch codecs, and a web-standard HTTP
  handler with bounded request parsing.

  Add the portable durable channel engine with authenticated upgrades, ordered
  replay, presence, targeted delivery, host procedures, namespaced storage,
  history pages, and durable timer retries. Engine state survives handler
  reconstruction, and the wire-size checks run before durable event or presence
  writes.

- [`dbbe1e2`](https://github.com/jonahseguin/cable/commit/dbbe1e21f6a888bff345794d68f11a095ad46b6c) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add reusable global-procedure resolvers. Resolvers capture middleware for an
  explicit contract leaf and preserve its context, input, output, and declared
  errors inside the existing complete `.procedures()` assembly.

### Patch Changes

- [`3a32e79`](https://github.com/jonahseguin/cable/commit/3a32e796ebaeb32821e4bcb1f929d1b2d99b88d6) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Prevent middleware from executing a mutation twice, sanitize malformed GET results, and
  reject success envelopes returned with failing HTTP statuses.
- Updated dependencies [[`fb7a0f0`](https://github.com/jonahseguin/cable/commit/fb7a0f052ea2f3be139bbab1a06b78083cf2556b), [`6d680ce`](https://github.com/jonahseguin/cable/commit/6d680ceafab14a0fe3ef82898fb838e4a5843333), [`c866a7a`](https://github.com/jonahseguin/cable/commit/c866a7a1cd0cd082fb226737eab01ab1141904fa)]:
  - @cablejs/contract@0.1.0

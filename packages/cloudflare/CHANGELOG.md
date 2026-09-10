# @cablejs/cloudflare

## 0.2.1

### Patch Changes

- [`5ab7008`](https://github.com/jonahseguin/cable/commit/5ab700825ca6e95f495979ea134cd187e82e3e22) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add privacy-safe diagnostics for procedure and channel operation timing, connection transitions, and runtime faults, plus cooperative AbortSignal support for HTTP procedures and Effect integrations.

- [`11f2c45`](https://github.com/jonahseguin/cable/commit/11f2c45186e023ff50364443926f325bf7a5ad7b) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add optional REST mounts and OpenAPI 3.1.2 generation for annotated global procedures.
- Updated dependencies [[`5ab7008`](https://github.com/jonahseguin/cable/commit/5ab700825ca6e95f495979ea134cd187e82e3e22), [`11f2c45`](https://github.com/jonahseguin/cable/commit/11f2c45186e023ff50364443926f325bf7a5ad7b)]:
  - @cablejs/core@0.2.1
  - @cablejs/contract@0.1.1

## 0.2.0

### Minor Changes

- [`22b7caf`](https://github.com/jonahseguin/cable/commit/22b7caffb4b89c11f3e2f30f46758c60a9ba7020) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Expose the production Durable Object base class so applications can extend a generated Cable host with typed RPC methods and lifecycle hooks.

- [`3c9cb53`](https://github.com/jonahseguin/cable/commit/3c9cb5314f36e5701d098ec3e17723ce8f4256e0) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Expose a trusted typed host facade for server-side channel procedures and event delivery.

### Patch Changes

- Updated dependencies [[`3c9cb53`](https://github.com/jonahseguin/cable/commit/3c9cb5314f36e5701d098ec3e17723ce8f4256e0)]:
  - @cablejs/core@0.2.0

## 0.1.0

### Minor Changes

- [`2e2c389`](https://github.com/jonahseguin/cable/commit/2e2c389d02df4371e5502a9e9d30f6ec6f513d43) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Add the Cloudflare Durable Object host and Worker edge handler. The adapter
  uses hibernatable WebSockets, signed private grants, Durable Object storage and
  alarms, and Durable Object RPC for host peers.

### Patch Changes

- [`dbbe1e2`](https://github.com/jonahseguin/cable/commit/dbbe1e21f6a888bff345794d68f11a095ad46b6c) Thanks [@jonahseguin](https://github.com/jonahseguin)! - Export `CloudflareHostInstance` for Durable Object namespace bindings that refer
  to a Cable-generated host class from the same environment type.
- Updated dependencies [[`fb7a0f0`](https://github.com/jonahseguin/cable/commit/fb7a0f052ea2f3be139bbab1a06b78083cf2556b), [`6d680ce`](https://github.com/jonahseguin/cable/commit/6d680ceafab14a0fe3ef82898fb838e4a5843333), [`6d680ce`](https://github.com/jonahseguin/cable/commit/6d680ceafab14a0fe3ef82898fb838e4a5843333), [`c866a7a`](https://github.com/jonahseguin/cable/commit/c866a7a1cd0cd082fb226737eab01ab1141904fa), [`3a32e79`](https://github.com/jonahseguin/cable/commit/3a32e796ebaeb32821e4bcb1f929d1b2d99b88d6), [`dbbe1e2`](https://github.com/jonahseguin/cable/commit/dbbe1e21f6a888bff345794d68f11a095ad46b6c)]:
  - @cablejs/contract@0.1.0
  - @cablejs/core@0.1.0

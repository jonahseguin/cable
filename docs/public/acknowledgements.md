---
title: Acknowledgements
description: The projects and ideas that shaped cable's contract and runtime design.
---

`cable` builds on a generous TypeScript ecosystem. These projects supplied the
ideas and tools that made its design possible.

## tRPC

[tRPC](https://trpc.io/) established the contract-shaped API experience that
inspired cable's procedure layer. In particular, cable borrows the feel of
builder-based procedures, inferred client inputs and outputs, and reusable
procedure builders for shared middleware. The [official tRPC documentation](https://trpc.io/docs)
describes the project as end-to-end type-safe APIs without code generation.

The [tRPC source repository](https://github.com/trpc/trpc) is available under
the [MIT license](https://github.com/trpc/trpc/blob/main/LICENSE).

cable extends that ergonomics into a separate contract package and durable,
typed channels for actor runtimes. The implementation and protocol are cable's
own work; this page records design influence rather than code provenance or an
endorsement.

## Effect

The optional `@cablejs/effect` package is informed by [Effect](https://effect.website/)
and its [source repository](https://github.com/Effect-TS/effect), available under
the [MIT license](https://github.com/Effect-TS/effect/blob/main/LICENSE.md).
Effect's typed error model and explicit resource and dependency ownership helped
shape this integration. The core library remains Promise-based, and the Effect
adapter keeps runtime ownership with the configured cable host and its layers.

Effect and tRPC are independent projects. Their names and marks belong to their
respective maintainers.

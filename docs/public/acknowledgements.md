---
title: Acknowledgements
description: The projects and ideas that shaped cable's contract and runtime design.
---

`cable` draws on the TypeScript ecosystem. The projects below shaped parts of
its API and runtime design.

## tRPC

[tRPC](https://trpc.io/) inspired cable's contract-shaped procedure API. cable
takes particular inspiration from its builder-based procedures, inferred client
inputs and outputs, and reusable procedure builders for shared middleware. The
[official tRPC documentation](https://trpc.io/docs) describes the project as
end-to-end type-safe APIs without code generation.

The [tRPC source repository](https://github.com/trpc/trpc) is available under
the [MIT license](https://github.com/trpc/trpc/blob/main/LICENSE).

cable applies those ideas in a separate contract package and adds durable,
typed channels for actor runtimes. cable's implementation and protocol are its
own work. This page records design influence, not code provenance or an
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

# 0013: An explicit Ox tooling stack

Status: accepted for M0, 2026-09-05. Supersedes DESIGN sections 3.1–3.4 wherever they prescribe Biome.

Use Oxlint for linting, its matching JavaScript plugin API for the pinned anti-slop
plugin, and Oxfmt as the only formatter. Keep TypeScript 5.9 as the authoritative
type checker, including strict optional properties, indexed access, and isolated
declarations for the contract. Fallow checks unused code and duplication separately.
Exact tool versions and the pnpm lockfile make local and CI behavior reproducible.

The user explicitly prefers Oxlint/Oxfmt and prohibits Prettier. Biome would duplicate
formatting and linting ownership. Ultracite's Ox presets are useful prior art, but a
preset dependency would add broad application-oriented rules and hide this library's
policy. Configure a focused set directly, including type-aware linting, instead.
Do not maximize rule counts at the expense of clear APIs or add arbitrary function
length and key-order constraints. Exceptions must explain a concrete limitation.

References: [Oxlint](https://oxc.rs/docs/guide/usage/linter.html),
[Oxfmt](https://oxc.rs/docs/guide/usage/formatter),
[Ultracite](https://github.com/haydenbleasel/ultracite),
[anti-slop](https://github.com/dmmulroy/anti-slop),
and [toolkit](https://github.com/Divnoor-4602/toolkit).

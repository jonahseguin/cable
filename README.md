# cable

Contract-first, type-safe procedures and durable WebSocket channels for actor
runtimes. Cloudflare Durable Objects first; Rivet follows after the portable
engine and conformance suite are stable.

**Status: M1 implementation is in progress.** The packages remain private while
the contract and procedure APIs are built and tested. [The design](docs/DESIGN.md)
describes the intended library; [the implementation plan](docs/PLAN.md) defines
the work and gates.

## Start working

Use the Bun version pinned in `package.json`. Node remains available for project
tools that require it; supported Node versions are listed in `engines.node`.

```sh
bun install --frozen-lockfile
bun run setup:hooks
bun run check
```

Agents start with [AGENTS.md](AGENTS.md). Claude imports the same instructions
through `CLAUDE.md`. Project-local skills are available in `.agents/skills` and
`.claude/skills`; provenance and maintenance instructions are in
[the skills guide](.agents/README.md).

The optional `setup:hooks` command installs this repository's pre-push quality gate
using local Git configuration. It does not change global hooks.

## Commands

| Command                    | Purpose                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| `bun run check`            | Format, lint, typecheck, boundaries, build, tests, Fallow, and type performance |
| `bun run format`           | Apply Oxfmt formatting                                                          |
| `bun run lint`             | Run Oxlint, typed checks, and vendored anti-slop rules                          |
| `bun run check:boundaries` | Enforce portable packages and dependency direction                              |
| `bun run build`            | Build ESM and declarations for every package                                    |
| `bun run test`             | Run behavior and built-package smoke tests; build first                         |
| `bun run fallow`           | Check unused code, duplication, and complexity                                  |
| `bun run generate:perf`    | Regenerate the fixed contract performance workload                              |
| `bun run ts-perf`          | Enforce the contract and client type-performance budgets                        |

[Reference repositories](references/README.md) are pinned research material,
excluded from project tooling. Study their implementations deliberately and
attribute any non-trivial port. [ADR 0013](docs/adr/0013-tooling.md) records why
this repo uses Oxlint/Oxfmt directly, without ESLint, Prettier, Biome, or an
Ultracite preset dependency.

The [Blume plan](docs/documentation.md) covers the later documentation site.
Packages remain private until API, licensing, ownership, and release checks are
complete. CI verifies the repository and does not publish packages or deploy sites.

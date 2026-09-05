# cable

Contract-first, type-safe procedures and durable WebSocket channels for actor
runtimes. Cloudflare Durable Objects first; Rivet follows after the portable
engine and conformance suite are stable.

**Status: repository setup (M0).** The packages are private scaffolds with no
implemented public API. [The design](docs/DESIGN.md) describes the intended
library; [the implementation plan](docs/PLAN.md) defines the work and gates.

## Start working

Use Node 22.18+ and the pnpm version pinned in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm setup:hooks
pnpm check
```

Agents start with [AGENTS.md](AGENTS.md). Claude imports the same instructions
through `CLAUDE.md`. Project-local skills are available in `.agents/skills` and
`.claude/skills`; provenance and maintenance instructions are in
[the skills guide](.agents/README.md).

The optional `setup:hooks` command installs this repository's pre-push quality gate
using local Git configuration. It does not change global hooks.

## Commands

| Command                 | Purpose                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `pnpm check`            | Format, lint, typecheck, boundaries, build, tests, Fallow, perf status |
| `pnpm format`           | Apply Oxfmt formatting                                                 |
| `pnpm lint`             | Oxlint, typed checks, and vendored anti-slop rules                     |
| `pnpm check:boundaries` | Enforce portable packages and dependency direction                     |
| `pnpm build`            | Build ESM and declarations for every package                           |
| `pnpm test`             | Tooling regression tests and built package smoke tests; build first    |
| `pnpm fallow`           | Unused code, duplication, and complexity checks                        |
| `pnpm generate:perf`    | Regenerate the fixed contract performance workload                     |
| `pnpm ts-perf`          | Report scaffold status; enforce real performance budgets from M1       |

[Reference repositories](references/README.md) are pinned research material,
excluded from project tooling. Study their implementations deliberately and
attribute any non-trivial port. [ADR 0013](docs/adr/0013-tooling.md) records why
this repo uses Oxlint/Oxfmt directly, without ESLint, Prettier, Biome, or an
Ultracite preset dependency.

The [Blume plan](docs/documentation.md) covers the later documentation site.
Packages remain private until API, licensing, ownership, and release checks are
complete. CI verifies the repository and does not publish packages or deploy sites.

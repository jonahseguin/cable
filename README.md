# cable

Contract-first, type-safe procedures and durable WebSocket channels for actor
runtimes.

Define an API once, implement it on the server, and call the same contract from
typed clients. The public guides cover [installation](docs/public/installation.md),
[a quickstart](docs/public/getting-started.md), contracts, procedures, clients,
and durable channels.

## Start working

Use the Bun version pinned in `package.json` and the recommended Node toolchain in
`.node-version`. Node 22.18 remains the minimum supported runtime and is checked by
CI; the full quality and type performance gate uses Node 24.16.

```sh
bun install --frozen-lockfile
bun run setup:hooks
bun run check
```

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

The documentation site is built from `docs/public` with Blume. Packages are
currently private workspace packages and are not yet available from
npm; the installation guide shows the supported repository workflow and the
publication status.

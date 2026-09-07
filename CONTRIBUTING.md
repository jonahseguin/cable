# Contributing to cable

## Set up a checkout

Use Bun 1.4.0 and a supported Node release. The repository pins Node 24.16.0
in `.node-version`.

```sh
git clone https://github.com/jonahseguin/cable.git
cd cable
```

Install the pinned dependency graph:

```sh
bun install --frozen-lockfile
```

The install script configures this checkout's local Git hooks at `.githooks`.
It does not replace a different local `core.hooksPath`. Run
`bun run setup:hooks` if you need to configure the hooks again.

## Useful commands

Run the full check before opening a pull request:

```sh
bun run check
```

That command formats, builds every workspace, runs lint and type checks,
checks package boundaries, runs the normal and Cloudflare tests, runs the
integration suite, checks Fallow findings, verifies the type performance
baseline, and builds and validates the docs.

Use a narrow check while working:

```sh
bun run build
bun test packages/contract/src/index.test.ts
bun run --filter @cablejs/cloudflare test
bun run docs:dev
bun run docs:build
bun run ts-perf --require-baseline
```

`bun run fallow` runs the dead-code, duplication, and complexity checks. Its
type-aware pass adds checker evidence where available; the deterministic
dead-code, duplication, and complexity gates still report their configured
findings.

## Make a change

Keep the dependency direction intact: `contract` is the base, `core` depends
on it, adapters and client depend on the lower layers, React depends on the
client, and conformance depends on the core. Keep runtime-specific APIs in
their adapter package.

Test observable behavior and failure paths. Preserve the public contract and
document behavior that callers need to rely on. Add a changeset for a public
package behavior or API change:

```sh
bun run changeset
```

Documentation and internal tooling changes do not need an empty changeset.
Use plain, specific prose and keep examples tied to code that exists.

## Open a pull request

Make the branch focused, run `bun run check`, and include the relevant test or
docs command in the pull request description. Explain the user-visible change,
the reason for it, and any remaining limitation. Keep generated output and
local credentials out of commits.

## License

Contributions are distributed under the repository's MIT license. By opening a
pull request, you agree that your contribution may be distributed under that
license.

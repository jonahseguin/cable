# 0015: Bun manages the workspace

Status: accepted, 2026-09-05. Supersedes DESIGN sections 3.1 through 3.4 and
ADR 0013 where they prescribe pnpm commands or a pnpm lockfile.

Bun 1.4.0 manages workspaces, dependency installation, the text lockfile, and
package scripts. The workspace uses the isolated linker so package boundaries do
not depend on hoisting. CI pins Bun and installs from `bun.lock` with
`--frozen-lockfile`. Node 22 remains installed because project tools may select it
through their executable shebangs. Library tests must remain portable and cannot
depend on Bun runtime APIs.

References: [Bun workspaces](https://bun.com/docs/pm/workspaces),
[Bun lockfiles](https://bun.com/docs/pm/lockfile), and
[Bun installation in CI](https://bun.com/docs/pm/cli/install#ci-cd).

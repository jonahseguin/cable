# Agent quality gate

`.codex/hooks.json` and `.claude/settings.json` call the same Stop hook.
`SessionStart` records the repository state. If the state changes before Stop,
the hook runs `bun run check`. If Stop has no session record, it runs the gate
rather than treating the current state as a new baseline.

- A passed check is reused only for the exact checked content. The commit, tracked
  worktree diff, and untracked file content make up that state.
- A session that leaves its starting state untouched does not run the gate.
- A failed check blocks Stop once. The resulting continuation may end to report
  the failure, but the hook tells the agent that the work remains unverified.
- A changed state reruns the gate. Subagent stops do not run it, so shared work
  does not make sibling agents wait on one another.

The cache lives under the operating system temporary directory and contains only
content hashes. The hook stores success only when the state before and after the
check matches.

Both tools require the user to trust repository hooks before they run. Trust is
outside this repository's control. A session where the hook becomes trusted only
after it starts runs the full gate at its first Stop.

Codex resolves this repository's script from the active session's documented git
root. A Codex session that leaves that repository or enters another worktree
blocks with an unverified-state message instead of checking the wrong tree. Start
a new session there. Git's local pre-push hook remains the backstop for every
repository push.

`bun install` runs `bun run setup:hooks` to register `.githooks` in the local
repository configuration. It leaves an existing custom `core.hooksPath` alone
and prints the remaining pre-push step.

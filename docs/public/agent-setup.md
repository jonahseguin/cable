---
title: Agent setup
description: Give Claude or Codex a bounded prompt for making safe cable changes.
---

This prompt is for an agent working in an existing cable checkout. It asks the
agent to inspect the repository before choosing a runtime or dependency, and to
stop when package resolution fails.

```text
Work in the existing cable repository. Before changing anything:

1. Inspect the project files, package manager, runtime, package manifests, and current git status.
2. Read the current repository guidance and the relevant docs in docs/.
3. Verify package names and versions from the manifests. Do not assume a package is published or available from a registry.
4. If an install or package lookup reports that a @cablejs/* package is unpublished or unavailable, stop and report the exact error. Do not substitute another dependency or invent a compatibility path.

For the requested change:

- Implement the smallest typed contract that demonstrates the behavior. Add a global procedure and a channel only when the request needs both.
- Reuse the runtime and authentication provider already present in the application. Do not add a new auth system.
- Keep secrets out of client code, examples, logs, and committed configuration.
- Preserve package boundaries and the existing API names.

Before reporting completion, run the narrowest relevant build and type checks, then any required docs or tests. Report the commands and results, list the changed files, and call out anything you could not verify.
```

The [quickstart](/getting-started) shows the contract flow. The [installation](/installation)
page explains the package choices.

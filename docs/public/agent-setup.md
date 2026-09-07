---
title: Agent setup
description: Give Claude or Codex a bounded prompt for adding cable to an existing app.
---

Paste this prompt into an agent working inside your existing application. It
asks the agent to use the app's runtime, framework, authentication, and
structure while adding a small cable feature.

```text
Work in this existing application. Before changing anything:

1. Inspect the app's framework, runtime, package manager, package manifests, authentication provider, and current git status.
2. Read the app's existing guidance, then read the relevant cable docs at https://www.cablejs.dev/getting-started and https://www.cablejs.dev/installation.
3. Install only the published @cablejs packages this app needs. Verify their current names and versions before installing them.

For the requested feature:

- Define the smallest typed contract and procedures that implement the request.
- Use the app's existing runtime and supported cable host/client integration. Add React, TanStack Query, or Effect integration only when the app already uses that technology and the feature benefits from it.
- Reuse the app's existing authentication provider and architecture. Do not add a parallel auth system or restructure unrelated code.
- Keep secrets out of client code, examples, logs, and committed configuration.

Implement the smallest working feature in the application. Before reporting completion, run the app's relevant build, type checks, and tests. Report the commands and results, list the changed files, and call out anything you could not verify.
```

The [quickstart](/getting-started) shows the contract flow. The [installation](/installation)
page explains the package choices.

---
title: Installation
description: Choose the smallest cable package set for your runtime and application.
---

## Choose the packages

Start with the smallest set that matches your application:

| Use case                    | Packages                           | Add when                                                                                |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| Shared contract             | `@cablejs/contract`                | Always. This is the client/server contract.                                             |
| Procedures and client calls | `@cablejs/core`, `@cablejs/client` | Your app calls procedures over HTTP.                                                    |
| React and TanStack Query    | `@cablejs/react`                   | Your client uses React or TanStack Query. It builds on `@cablejs/client`.               |
| Cloudflare Durable Objects  | `@cablejs/cloudflare`              | Your channel hosts run in Cloudflare Durable Objects.                                   |
| Local Node server           | `@cablejs/adapter-node`            | You need Node HTTP and WebSocket handlers for development.                              |
| Effect integration          | `@cablejs/effect`                  | Your application already uses Effect. The current workspace uses `effect@4.0.0-rc.112`. |

## Install

For a procedure-only client and server, the intended install is:

```sh
bun add @cablejs/contract @cablejs/core @cablejs/client
```

For React, add the optional integration:

```sh
bun add @cablejs/react
```

The package manager can be Bun, npm, or pnpm. Keep `@cablejs/react` out of a
vanilla client, and keep `@cablejs/effect` out of the core path unless the
application uses Effect. The core and client packages use web APIs; Node and
Cloudflare APIs stay in their adapters.

Continue with the [quickstart](/getting-started), or use [agent setup](/agent-setup)
when an agent will make repository changes.

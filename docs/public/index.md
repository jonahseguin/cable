---
title: Cable
description: Define procedures and durable typed channels once, then use them from your server and TypeScript client.
---

Cable is a TypeScript library for procedures and durable typed channels on actor runtimes. Define the API in a shared contract. Your server implements its leaves, and your client calls the same leaves with inferred inputs, outputs, and declared failures.

Start with the small procedure flow, then add an authenticated Cloudflare host and a room channel when the application needs live state.

## Start here

- [Get started](/getting-started) follows one contract from server handler to client call.
- [Examples](/examples) points to the runnable chat application and its source files.
- [Define a contract](/contracts) describes global procedures and channel families.
- [Implement procedures](/procedures) connects global procedures to server code.
- [Use the client](/client) calls procedures and opens typed channel handles.

## Choose your next guide

- [Authorization](/authorization) shows context refinement with public, protected, and admin procedures.
- [React](/react) adds Cable to a React component tree.
- [Channels](/channels) explains channel keys, events, presence, and history.
- [Cloudflare Durable Objects](/adapters/cloudflare) runs one channel host per Durable Object.

---
title: Cable
description: Cable defines contract-first procedures and durable typed channels for actor runtimes, keeping the client and server connected through one shared API.
---

Cable is a TypeScript library for procedures and durable, typed channels on actor runtimes. A shared contract defines the API. Server implementations and clients each depend on that contract, not on each other.

Cable is private and unpublished. The installation material in these docs applies to a checkout of this repository. There is no package version to install from npm yet.

## Start here

- [Get started](/getting-started) builds and runs the local Cloudflare chat example.
- [Define a contract](/contracts) describes procedure and channel declarations.
- [Implement procedures](/procedures) connects a contract to server code.
- [Use the client](/client) calls procedures and subscribes to channels.
- [Run on Cloudflare](/adapters/cloudflare) connects the edge Worker to Durable Objects.

## Runtime status

Cloudflare, React, and the Node development host have passed their project gates. The [Rivet adapter](/adapters/rivet) remains beta while its hibernation conformance gate is unresolved. The [Effect integration](/integrations/effect) targets Effect `4.0.0-rc.112`, remains private, and is not a stable package release.

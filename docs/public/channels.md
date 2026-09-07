---
title: Build channels
description: Define one durable channel family, implement its server behavior, and use typed events, presence, history, and lifecycle hooks.
---

A channel is one parameterized host family. `chat.{roomId}` gives each room its own ordered event log, presence set, and host state.

```ts
import { c } from "@cablejs/contract";
import { z } from "zod";

export const api = c.contract({
  chat: c.channel("chat.{roomId}", {
    client: {
      send: {
        input: z.object({ text: z.string().trim().min(1).max(2_000) }),
        errors: { MUTED: z.void() },
      },
    },
    server: { message: z.object({ from: z.string(), text: z.string() }) },
    presence: z.object({ typing: z.boolean() }),
    history: { retain: "24h", max: 10_000 },
  }),
});
```

The `server` map declares events clients receive. The `client` map declares commands clients can send. Both parse their input at the Cable boundary. A client event without `{ ack: true }` is fire-and-forget. Declare its `errors` only when callers need an acknowledged failure.

## Implement the host

```ts
import { CableError, type ChannelImplementation } from "@cablejs/core";
import { api } from "./api.js";

export const chatImplementation = {
  authorize({ grants, params }) {
    if (!grants.includes(`room:${params.roomId}`)) throw new CableError("FORBIDDEN");
  },
  onClient: {
    async send(context, { text }) {
      if (await context.storage.get(`muted:${context.identity.userId}`)) {
        throw new CableError("MUTED");
      }
      await context.emit("message", { from: context.identity.userId, text });
    },
  },
  procedures: {},
} satisfies ChannelImplementation<typeof api.chat, { userId: string }>;
```

`authorize` runs after Cable verifies the edge-signed grant and before the socket is accepted. `onClient` receives parsed input, the authenticated identity, parsed route parameters, namespaced durable storage, live connections, peer access, and durable `emit` methods. Keep authorization decisions in `authorize` or in the event and procedure that needs them. Do not trust data from the socket as identity.

`emit` validates the event, appends it to the channel log, then delivers it to connected clients. `emitTo` sends to one connection or user. It is transient unless passed `{ log: true }`.

## Use a channel

```ts
// client.ts
const room = client.chat({ roomId: "general" });
const offMessage = room.on("message", (message) => renderMessage(message));
const offPresence = room.presence.on(() => renderPresence(room.presence.others));

room.presence.update({ typing: true });
await room.send({ text: "Hello" }, { ack: true });

offMessage();
offPresence();
room.dispose();
```

Subscribing, sending, or updating presence opens the connection. Handles with the same canonical channel key share one socket within a client. `dispose()` releases that handle. A socket remains available until the configured idle-close delay expires.

Presence is one value per connection. `presence.self` is this connection's latest value and `presence.others` contains every other live connection, including multiple connections for one user. Presence disappears when the connection closes; the host also removes entries whose sockets no longer exist.

## History and lifecycle

`history` adds `room.history.load({ before, limit })`. Pages are ascending, `before` is exclusive, and a host accepts at most 100 events per request. `nextCursor` fetches the preceding page.

`onConnect` and `onDisconnect` are best-effort application hooks. Use durable storage for state that must survive a restart or hibernation. Use the `reset` event to refetch a view when retained replay is unavailable. [Reliability](/reliability) defines the delivery boundary.

---
title: React channels
description: Subscribe React components to Cable channels, typed server events, connection state, and presence without owning socket cleanup yourself.
---

`@cable/react` gives components a channel handle for as long as they are mounted. It does not provide a replacement for TanStack Query. Use [TanStack Query](/tanstack-query) for procedure caching, mutations, and hydration.

The hooks need a Cable client built from the runtime contract. This client module is imported by the component examples below.

```ts title="src/cable.ts"
import { createClient } from "@cable/client";

import { api } from "./api.js";

export const cable = createClient({
  contract: api,
  url: "/_cable",
  ws: { cursors: sessionStorage, idleClose: 1_000 },
});
```

## Subscribe to a channel

Pass the channel factory and its parameters to `useChannel`. The handle has the client events, host procedures, presence, and history declared by that channel's contract.

```tsx title="src/room.tsx"
import { useChannel, useChannelStatus, useEvent, usePresence } from "@cable/react";
import { useEffect, useState } from "react";

import { cable } from "./cable.js";

export function Room({ roomId, userName }: { roomId: string; userName: string }) {
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const room = useChannel(cable.chat, { roomId });
  const status = useChannelStatus(room);
  const presence = usePresence(room);

  useEvent(room, "message", (message) => {
    setMessages((current) => [...current, `${message.user}: ${message.text}`]);
  });

  useEffect(() => presence.update({ name: userName }), [presence, userName]);
  useEffect(() => room.onError((cause) => setError(cause.message)), [room]);

  async function send(): Promise<void> {
    await room.send({ text: "Hello" }, { ack: true });
  }

  return (
    <section>
      <p>Connection: {status}</p>
      <p>Other people: {presence.others.map((member) => member.d.name).join(", ")}</p>
      {error === undefined ? null : <p role="alert">{error}</p>}
      <button disabled={status !== "open"} onClick={() => void send()}>
        Send
      </button>
      <ul>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </section>
  );
}
```

`useEvent` accepts only server event names declared for the channel. `usePresence` is available only when the contract declares `presence`. Its `self`, `others`, and `update` values use that schema's inferred types.

## Channel lifetime

- `useChannel` creates the handle during render and retains its subscription after mount. Rendering on the server never opens a socket.
- Each mounted consumer retains one lease. Consumers for the same channel parameters share the client's connection; the final unmount releases it.
- `useEvent`, `useChannelStatus`, and `usePresence` subscribe and unsubscribe with the component. Do not call `dispose()` on a handle returned by `useChannel`.
- `useChannelStatus` reports `connecting`, `open`, `resuming`, or `closed`. `resuming` lasts until Cable receives every replay chunk after reconnect.

The client applies its `ws.idleClose` delay only after the final lease is released. Set `idleClose: 0` when a route should close immediately after its last channel consumer unmounts.

## Handle reconnects and reset

Cable resumes logged server events from its last delivered sequence. A retained-history gap emits the channel's `reset` event after the next welcome frame. Refetch state that depends on the channel when it happens.

```tsx
import { useChannel, useEvent } from "@cable/react";
import { useQueryClient } from "@tanstack/react-query";

import { cable } from "./cable.js";

export function RoomMessages({ roomId }: { roomId: string }) {
  const queryClient = useQueryClient();
  const room = useChannel(cable.chat, { roomId });

  useEvent(room, "reset", () => {
    void queryClient.invalidateQueries({ queryKey: ["cable", "chat.history", roomId] });
  });

  return null;
}
```

`room.send(input, { ack: true })` and host procedure calls reject if their request cannot complete. Handle those promises where the user action began. `room.onError` receives asynchronous channel failures such as a failed reconnect or an unacknowledged event validation error.

## Server rendering

All channel hooks return stable server snapshots. `useChannelStatus` returns `"closed"`, and `usePresence` returns an empty snapshot during server rendering. Hydration starts the subscription after the component mounts. Render a neutral disconnected state on the server, then use the status value to enable controls on the client.

Use `room.history.load()` with your query library when the page needs retained messages. The [chat example](https://github.com/jonahseguin/cable/tree/main/examples/chat-cloudflare/src/room-conversation.tsx) stores history in TanStack Query and appends live `message` events to that cache.

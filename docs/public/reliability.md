---
title: Channel delivery and recovery
description: Know what Cable orders, replays, acknowledges, and asks the application to refetch.
---

Cable orders durable server events within one channel host. `context.emit()` validates an event, assigns its next sequence number, persists it, then broadcasts it. Events from different channel instances have no shared order.

On reconnect, the client sends its last delivered sequence. The host replays the retained suffix and sends a terminal welcome frame. The client reports `open` only after that terminal frame. It reports `resuming` while replay is in progress.

If the cursor predates retained data, the terminal welcome carries `reset: true` and no replay events. Listen for it and refetch the view that depends on the channel:

```ts
const room = client.chat({ roomId: "general" });
room.on("reset", () => void reloadRoom("general"));
```

The normal resume log retains 1,000 events or five minutes when the contract has no `history` policy. A channel with `history` uses its declared `max` and `retain` policy for that log. Persistent cursors are optional client configuration through `ws.cursors`; without them, one live client instance still resumes from memory.

## What acknowledgements mean

`room.send(input)` queues an event and returns immediately. `await room.send(input, { ack: true })` resolves only after the host replies. `await room.someProcedure(input)` has the same request/reply boundary.

An acknowledged event or channel procedure rejects when its connection breaks before the reply arrives. Cable does not retry either operation because retrying might repeat an application write. Make writes idempotent with an application request ID when callers need safe retries.

Presence follows the same connection lifecycle but is not part of the durable event log. A reconnect creates a new presence member. Targeted events sent with `emitTo` are also transient unless the host explicitly uses `{ log: true }`.

Use `onStatus` and `onError` for UI state. A status of `closed` does not prove the remote host lost data. It says this handle has no active managed connection.

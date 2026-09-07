# @cablejs/react

`@cablejs/react` connects a Cable client to React and TanStack Query. It provides
native query and mutation options, plus hooks that lease channel handles while a
component is mounted.

Install `react` and `@tanstack/react-query` in the application. Both are peer
dependencies. Place the application below TanStack's `QueryClientProvider`.

```tsx
import {
  createCableQuery,
  useChannel,
  useChannelStatus,
  useEvent,
  usePresence,
} from "@cablejs/react";
import { useMutation, useQuery } from "@tanstack/react-query";

const cableQuery = createCableQuery(cable);

function Room({ roomId }: { roomId: string }) {
  const room = useChannel(cable.chat, { roomId });
  const status = useChannelStatus(room);
  const presence = usePresence(room);
  const posts = useQuery(cableQuery.posts.list.queryOptions({ roomId }));
  const createPost = useMutation(cableQuery.posts.create.mutationOptions());

  useEvent(room, "message", (message) => {
    console.log(message.text);
  });

  return <button onClick={() => presence.update({ typing: true })}>{status}</button>;
}
```

`queryOptions(input)` returns a native TanStack query-options object with key
`["cable", path, input]`. `mutationOptions()` returns native mutation options;
TanStack passes its mutation argument to Cable. The facade does not wrap
`useQuery` or `useMutation`, so cache configuration, hydration, and errors stay
in TanStack's normal APIs.

`useChannel` opens its subscription after mount and releases its lease at
unmount. It does not dispose the handle, so another mounted consumer or a later
render can retain it. `useChannelStatus`, `useEvent`, and `usePresence` subscribe
to that handle. During server rendering, hooks return closed or empty snapshots
and do not open a socket; hydration creates the channel subscription.

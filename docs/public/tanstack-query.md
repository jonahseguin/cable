---
title: TanStack Query
description: Use cable procedures with native TanStack Query options, typed keys, mutations, cache invalidation, and server-side prefetching.
---

`createCableQuery(client)` returns a contract-shaped object with native TanStack Query options. cable does not wrap `useQuery` or `useMutation`, so query configuration, cache ownership, retries, errors, and hydration keep their usual TanStack Query behavior.

```ts title="src/cable-query.ts"
import { createCableQuery } from "@cablejs/react";

import { cable } from "./cable.js";

export const cableQuery = createCableQuery(cable);
```

The facade mirrors procedure paths. Query procedures expose `queryKey(input)` and `queryOptions(input)`. Mutation procedures expose `mutationOptions()`.

## Configure React Query once

Place the application below `QueryClientProvider`. Keep the client stable across browser renders.

```tsx title="src/app.tsx"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

export function App({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

## Fetch and mutate

Pass the returned options directly to TanStack's hooks, then add ordinary TanStack options when needed.

```tsx title="src/posts.tsx"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cableQuery } from "./cable-query.js";

export function Posts({ roomId }: { roomId: string }) {
  const queryClient = useQueryClient();
  const posts = useQuery({
    ...cableQuery.posts.list.queryOptions({ roomId }),
    staleTime: 30_000,
  });
  const createPost = useMutation({
    ...cableQuery.posts.create.mutationOptions(),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: cableQuery.posts.list.queryKey({ roomId }),
      }),
  });

  if (posts.isPending) return <p>Loading posts...</p>;
  if (posts.error !== null) return <p role="alert">{posts.error.message}</p>;

  return (
    <>
      <button onClick={() => createPost.mutate({ roomId, title: "A new post" })}>
        Create post
      </button>
      <ul>
        {posts.data.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </>
  );
}
```

`queryOptions(input)` uses the key `["cable", path, input]`. Call `queryKey(input)` for invalidation, prefetching, or direct cache reads. Its key carries the procedure's output type, so `queryClient.getQueryData(cableQuery.posts.list.queryKey({ roomId }))` has the same data type as the query.

`mutationOptions()` receives the mutation input through `mutate(input)` or `mutateAsync(input)`. Its error type includes the procedure's declared errors and cable's built-in transport errors. Inspect a declared code in the standard mutation error branch.

```tsx
if (createPost.error?.code === "FORBIDDEN") {
  return <p role="alert">You cannot create posts in this room.</p>;
}
```

## Prefetch for server rendering

Create a `QueryClient` per server request. Prefetch cable's native options, dehydrate the result, and hydrate the same options on the client. The code below leaves request creation to the framework and receives the request-scoped client explicitly.

```tsx title="src/posts-ssr.tsx"
import { dehydrate, HydrationBoundary, QueryClient, useQuery } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";

import { cableQuery } from "./cable-query.js";

export async function prefetchPosts(
  queryClient: QueryClient,
  roomId: string,
): Promise<DehydratedState> {
  await queryClient.prefetchQuery(cableQuery.posts.list.queryOptions({ roomId }));
  return dehydrate(queryClient);
}

function PostList({ roomId }: { roomId: string }) {
  const posts = useQuery(cableQuery.posts.list.queryOptions({ roomId }));
  return (
    <ul>
      {posts.data?.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}

export function HydratedPosts({ roomId, state }: { roomId: string; state: DehydratedState }) {
  return (
    <HydrationBoundary state={state}>
      <PostList roomId={roomId} />
    </HydrationBoundary>
  );
}
```

Channel sockets are separate from procedure caching. Use [React channels](/react) to subscribe after hydration, then update or invalidate a matching query key when a server event changes cached data.

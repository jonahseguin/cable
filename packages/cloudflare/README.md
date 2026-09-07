# @cablejs/cloudflare

`@cablejs/cloudflare` runs one Cable channel host in a Cloudflare Durable Object.
It exports `cloudflareHost()` to create the Durable Object class and
`createHandler()` for the Worker edge routes.

The edge handler authenticates RPC, host-fallback, and WebSocket requests. For
an accepted upgrade it removes caller credentials, signs a private grant, and
forwards the request to the named Durable Object. The host validates the grant
again before it accepts the socket.

```ts
import { cloudflareHost, createHandler } from "@cablejs/cloudflare";

export const ChatHost = cloudflareHost(api.chat, chatImplementation, {
  grantSecret: (env: Env) => env.CABLE_GRANT_SECRET,
  peer: (env: Env, key) => env.CHAT_HOSTS.getByName(key),
});

const handler = createHandler(api, procedures, {
  authenticate: (request, env) => authenticate(request, env),
  context: ({ identity, hosts }) => ({ identity, hosts }),
  credentials: { mode: "bearer" },
  grantSecret: (env) => env.CABLE_GRANT_SECRET,
  grants: (identity) => grantsFor(identity),
  hosts: (env) => [{ channel: api.chat, namespace: env.CHAT_HOSTS }],
  uid: (identity) => identity.userId,
});

export default { fetch: handler.fetch };
```

The package uses hibernatable WebSockets, serialized attachments, Durable Object
storage and alarms, and RPC for peer calls. Its workerd suite covers the shared
host matrix in ordinary and forced-hibernation modes, public edge routing, and
credential stripping. Workerd does not expose a supported way to lose a socket
without calling the close callback, so MemoryHost covers stale-presence sweeping.

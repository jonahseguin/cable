---
title: Channel grants
description: Bind an authenticated identity to one channel key, its parsed parameters, and the capabilities that channel may use.
---

Channel grants are the private edge-to-host handoff. The edge authenticates the request, resolves the raw channel parameters, and asks your `grants` callback for capabilities. Cable signs those claims with the configured `grantSecret`; the host verifies the signature before it accepts a socket or handles a channel operation.

## Grant one room at a time

Use the parsed route parameters to decide which channel instances a user may enter. `key` is the canonical host key, and `params` is the validated string map for that key.

```ts title="worker.ts"
import { createHandler } from "@cablejs/cloudflare";
import { api } from "./api.js";
import { procedures } from "./procedures.js";

interface Identity {
  readonly userId: string;
  readonly roomIds: readonly string[];
}

declare function authenticateSession(request: Request, env: Env): Promise<Identity | null>;

export const handler = createHandler(api, procedures, {
  authenticate: authenticateSession,
  context: ({ identity }) => ({ identity }),
  credentials: { mode: "bearer" },
  grantSecret: (env) => env.CABLE_GRANT_SECRET,
  grantTtlMs: 60_000,
  grants: (identity, _key, params) => {
    const roomId = params["roomId"];
    return roomId !== undefined && identity.roomIds.includes(roomId) ? [`room:${roomId}`] : [];
  },
  hosts: (env) => [{ channel: api.chat, namespace: env.CHAT_HOSTS }],
  uid: (identity) => identity.userId,
});
```

The callback runs only after authentication, so it receives an `Identity`, never `null`. This example assumes the session verifier loaded the user's allowed room IDs into that identity. Returning no capability does not grant access. The host still calls `authorize` with the signed claims, which is the final admission check.

## Enforce the grant at the host

Keep the channel's policy in its implementation. The edge chooses capabilities from the authenticated identity; the host rejects a grant that does not contain the capability required for this channel instance.

```ts title="chat-host.ts"
import { CableError, type ChannelImplementation } from "@cablejs/core";
import { api } from "./api.js";

export const chatImplementation = {
  authorize({ grants, params }) {
    if (!grants.includes(`room:${params.roomId}`)) {
      throw new CableError("FORBIDDEN");
    }
  },
  onClient: {},
  procedures: {},
} satisfies ChannelImplementation<typeof api.chat, { userId: string }>;
```

`authorize` runs after HMAC verification and canonical host-key and parameter checks, before the socket is accepted. It receives `identity`, `uid` when configured, `grants`, parsed `params`, the canonical `hostKey`, and the host-side `Request`. The host-side request has caller credentials removed, so use the verified grant fields rather than reading an authorization header there.

Channel event and procedure handlers receive the same `identity` and `grants`. Recheck a capability for sensitive events or procedures. A channel procedure can also see `connection` for socket calls; it is absent for the authenticated HTTP fallback. `uid` is available to `authorize`; use it there when admission depends on a stable user tag.

## Expiry and reconnects

Grants carry an absolute expiry in milliseconds. The default lifetime is 60 seconds; set `grantTtlMs` when that policy needs a different positive duration. A new socket or HTTP host call gets a newly authenticated grant. Reconnect does not reuse the old grant.

Expiry protects admission to new operations. It does not revoke an already accepted socket by itself. To remove access from a live connection, close that connection from application code or reject its next event or procedure; use durable application state when revocation must survive a host restart. Keep the grant short-lived and make `authorize` and sensitive handlers consult the current policy.

The signed payload contains version `1`, expiry, canonical `hostKey`, parsed string `params`, JSON identity, nonempty string `grants`, and optional `uid`. Hosts reject an invalid signature, unknown payload keys, an expired grant, a wrong host key, or parameters that do not reproduce the key. The HMAC secret belongs in the edge and host environment; do not send it to clients.

import { cloudflareHost, createHandler } from "@cable/cloudflare";
import type { PeerMessage } from "@cable/core";
import type { DurableObject } from "cloudflare:workers";

import { api } from "./api.js";
import {
  chatImplementation,
  identityFromRequest,
  procedures,
  type Identity,
} from "./chat-server.js";

interface ChatDurableObject extends DurableObject<Env> {
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The core peer caller parses each operation's structured-clone result.
  __cable_peer(message: PeerMessage): Promise<unknown>;
}

interface Env {
  readonly CHAT: DurableObjectNamespace<ChatDurableObject>;
  readonly CABLE_GRANT_SECRET: string;
}

export const ChatHost = cloudflareHost(api.chat, chatImplementation, {
  grantSecret: (env: Env) => env.CABLE_GRANT_SECRET,
  peer: (env: Env, key) => env.CHAT.getByName(key),
});

const handler = createHandler(api, procedures, {
  authenticate(request: Request): Identity | null {
    return identityFromRequest(request);
  },
  context: ({ identity }) => ({ identity }),
  credentials: { mode: "bearer" },
  grantSecret: (env: Env) => env.CABLE_GRANT_SECRET,
  grants: () => ["chat"],
  hosts: (env: Env) => [{ channel: api.chat, namespace: env.CHAT }],
  uid: (identity: Identity) => identity.userId,
});

const worker = {
  fetch: (request: Request, env: Env, execution: ExecutionContext): Promise<Response> =>
    handler.fetch(request, env, execution),
} satisfies ExportedHandler<Env>;

export default worker;

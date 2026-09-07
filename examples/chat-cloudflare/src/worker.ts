import { cloudflareHost, createHandler, type CloudflareHostInstance } from "@cablejs/cloudflare";

import { api } from "./api.js";
import {
  chatImplementation,
  identityFromRequest,
  procedures,
  type Identity,
} from "./chat-server.js";

interface Env {
  readonly CHAT: DurableObjectNamespace<CloudflareHostInstance<Env>>;
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

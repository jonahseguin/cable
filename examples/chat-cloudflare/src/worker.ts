import { cloudflareHost, createHandler } from "@cable/cloudflare";
import { CableError, implement } from "@cable/core";
import type { ChannelImplementation, PeerMessage } from "@cable/core";
import type { DurableObject } from "cloudflare:workers";

import { api } from "./api.js";

interface Identity {
  readonly userId: string;
  readonly name: string;
}

interface AppContext {
  readonly identity: Identity | null;
}

interface ChatDurableObject extends DurableObject<Env> {
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The core peer caller parses each operation's structured-clone result.
  __cable_peer(message: PeerMessage): Promise<unknown>;
}

interface Env {
  readonly CHAT: DurableObjectNamespace<ChatDurableObject>;
  readonly CABLE_GRANT_SECRET: string;
}

const implementation = {
  authorize(context) {
    if (!context.grants.includes("chat")) throw new CableError("FORBIDDEN");
  },
  onClient: {
    async send(context, input) {
      await context.emit("message", { text: input.text, user: context.identity.name });
    },
  },
  procedures: {
    info(context) {
      return { roomId: context.params.roomId };
    },
  },
} satisfies ChannelImplementation<typeof api.chat, Identity>;

export const ChatHost = cloudflareHost(api.chat, implementation, {
  grantSecret: (env: Env) => env.CABLE_GRANT_SECRET,
  peer: (env: Env, key) => env.CHAT.getByName(key),
});

const procedures = implement(api)
  .context<AppContext>()
  .procedures({
    session: {
      whoami: ({ ctx }) => {
        if (ctx.identity === null) throw new CableError("UNAUTHORIZED");
        return ctx.identity;
      },
    },
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

function identityFromRequest(request: Request): Identity | null {
  const bearer = request.headers.get("authorization");
  const token =
    bearer?.startsWith("Bearer ") === true
      ? bearer.slice("Bearer ".length)
      : new URL(request.url).searchParams.get("token");
  if (token === null) return null;
  const name = token.trim();
  if (name.length === 0 || name.length > 48) return null;
  return { name, userId: name };
}

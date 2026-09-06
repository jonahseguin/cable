import { CableError, implement } from "@cable/core";
import type { ChannelImplementation } from "@cable/core";

import { api } from "./api.js";

export interface Identity {
  readonly userId: string;
  readonly name: string;
}

export interface AppContext {
  readonly identity: Identity | null;
}

export const chatImplementation = {
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

export const procedures = implement(api)
  .context<AppContext>()
  .procedures({
    session: {
      whoami: ({ ctx }) => {
        if (ctx.identity === null) throw new CableError("UNAUTHORIZED");
        return ctx.identity;
      },
    },
  });

export function identityFromRequest(request: Request): Identity | null {
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

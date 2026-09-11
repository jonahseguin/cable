import { cloudflareHost, createHandler, type CloudflareHostInstance } from "@cablejs/cloudflare";
import { createOpenApiDocument, createRestHandler } from "@cablejs/openapi";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

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

const CableChatHost = cloudflareHost(api.chat, chatImplementation, {
  grantSecret: (env: Env) => env.CABLE_GRANT_SECRET,
  peer: (env: Env, key) => env.CHAT.getByName(key),
});

/** Application-owned Durable Object entry point; add app RPC methods here. */
export class ChatHost extends CableChatHost {}

const handler = createHandler(api, procedures, {
  authenticate(request: Request): Identity | null {
    return identityFromRequest(request);
  },
  context: ({ hosts, identity }) => ({ chat: hosts.chat, identity }),
  credentials: { mode: "bearer" },
  grantSecret: (env: Env) => env.CABLE_GRANT_SECRET,
  grants: () => ["chat"],
  hosts: (env: Env) => [{ channel: api.chat, namespace: env.CHAT }],
  mount: createRestHandler(api, procedures),
  uid: (identity: Identity) => identity.userId,
});

const openApiDocument = createOpenApiDocument(api, {
  info: { title: "cable chat example", version: "0.1.0" },
  securitySchemes: { bearerAuth: { scheme: "bearer", type: "http" } },
});

const notificationInput = z.object({
  roomId: z.string().min(1),
  text: z.string().trim().min(1).max(2_000),
});

const app = new Hono<{ Bindings: Env }>();

app.get("/openapi.json", (context) => context.json(openApiDocument));

app.post("/notifications", bodyLimit({ maxSize: 1_048_576 }), async (context) => {
  const identity = identityFromRequest(context.req.raw);
  if (identity === null) return context.text("Unauthorized", 401);

  let rawInput: unknown;
  try {
    rawInput = await context.req.json();
  } catch {
    return context.text("Invalid JSON", 400);
  }
  const parsedInput = notificationInput.safeParse(rawInput);
  if (!parsedInput.success) return context.text("Invalid notification", 400);

  const input = parsedInput.data;
  await handler
    .hosts({ env: context.env, principal: { identity, uid: identity.userId } })
    .chat({ roomId: input.roomId })
    .emit("message", { text: input.text, user: identity.name });
  return context.json({ roomId: input.roomId, text: input.text, user: identity });
});

app.all("*", (context) => handler.fetch(context.req.raw, context.env, context.executionCtx));

export default app satisfies ExportedHandler<Env>;

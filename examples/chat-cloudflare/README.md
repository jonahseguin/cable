# Cable chat

This example uses `@cablejs/react` channel hooks and native TanStack Query
options. Its root creates one QueryClient per server render and browser root.

For the Cloudflare version, copy `.dev.vars.example` to `.dev.vars`, set a
secret of at least 32 characters, then start the Worker and browser app in
separate terminals:

```sh
bunx wrangler dev --local --port 8789
bun --filter @cablejs/example-chat-cloudflare dev
```

For local Node development without Wrangler, set `CABLE_GRANT_SECRET` and run:

```sh
bun --filter @cablejs/example-chat-cloudflare dev:node
```

The command builds the Node API for Node, starts it on port 8789, and starts
Vite in Node mode. Vite proxies `/_cable` HTTP and WebSocket traffic to that
API, so the same browser UI and contract run in both modes. Node state stays in
memory and disappears when the API process stops.

The browser and HTTP examples use `Authorization: Bearer <name>`. This is a
local demo identity scheme. It accepts a non-empty name up to 48 characters and
does not verify a password, session, or token signature. Replace
`identityFromRequest` before deployment.

## REST, OpenAPI, and application notifications

The Worker serves the generated OpenAPI 3.1.2 document at `/openapi.json`.
`GET /api/session` and `POST /api/rooms/{roomId}/messages` are authenticated
global procedures. The post route emits the existing `chat.message` event to
the room's Durable Object.

```sh
curl http://127.0.0.1:8789/openapi.json

curl --header 'Authorization: Bearer alice' \
  http://127.0.0.1:8789/api/session

curl --request POST \
  --header 'Authorization: Bearer alice' \
  --header 'Content-Type: application/json' \
  --data '{"text":"Hello from REST"}' \
  http://127.0.0.1:8789/api/rooms/general/messages
```

`POST /notifications` is an application-owned Hono route. It uses the same
demo authentication and calls Cable's typed server host facade to publish the
same `chat.message` event. It is intentionally absent from the generated
OpenAPI document because it is not a global Cable procedure.

```sh
curl --request POST \
  --header 'Authorization: Bearer alice' \
  --header 'Content-Type: application/json' \
  --data '{"roomId":"general","text":"Hello from Hono"}' \
  http://127.0.0.1:8789/notifications
```

Run `bun --filter @cablejs/example-chat-cloudflare test:integration` for the
local Worker smoke, or `bun --filter @cablejs/example-chat-cloudflare
test:integration:node` for the Node smoke. Both connect Alice and Bob and
check delivery, presence, history, global RPC, and the HTTP host fallback.

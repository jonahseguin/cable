// Create an actor on Rivet Cloud and print the WebSocket URL a game client connects to.
//
// The only input is the connection URL from the Rivet dashboard, which carries the
// namespace and token as userinfo:
//
//   RIVET_URL=https://<namespace>:<pk_token>@api.rivet.dev
//
// Game clients cannot send an Authorization header (Bayou/browser WebSockets), so the
// token is moved into the gateway path as `<actor_id>@<token>` instead.
import { writeFileSync } from "node:fs";
import { encode as cborEncode } from "cbor-x";

const raw = process.env.RIVET_URL;
if (!raw) {
  console.error("RIVET_URL is required, e.g.");
  console.error("  RIVET_URL=https://<namespace>:<token>@api.rivet.dev node e2e-test/create-cloud-actor.mjs");
  process.exit(1);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error(`RIVET_URL is not a valid URL: ${raw}`);
  process.exit(1);
}

const namespace = decodeURIComponent(url.username);
const token = decodeURIComponent(url.password);
if (!namespace || !token) {
  console.error("RIVET_URL must embed credentials as https://<namespace>:<token>@<host>");
  process.exit(1);
}

const origin = `${url.protocol}//${url.host}`;
const wsOrigin = origin.replace(/^http/i, "ws");
const key = process.env.ACTOR_KEY || "cloud-demo";
const actorName = process.env.RIVET_ACTOR_NAME || "game";
// The managed pool the Rivet CLI creates is named `default`, not the actor name.
const runnerName = process.env.RIVET_RUNNER_NAME || "default";

// container-runner decodes this from the actor input as CBOR to launch its child.
const input = Buffer.from(cborEncode({ port: 7770 })).toString("base64");

const res = await fetch(`${origin}/actors?namespace=${encodeURIComponent(namespace)}`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({
    name: actorName,
    key,
    input,
    runner_name_selector: runnerName,
    crash_policy: "destroy",
  }),
});

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  console.error(`create actor failed (${res.status}): ${text}`);
  process.exit(1);
}

// Re-running against the same key is normal (one actor = one match). Reuse it so the
// script is idempotent instead of failing on the second run.
let actorId = body.actor?.actor_id;
if (!res.ok) {
  if (body.code === "duplicate_key" && body.metadata?.existing_actor_id) {
    actorId = body.metadata.existing_actor_id;
    console.error(`reusing existing actor for key '${key}'`);
  } else {
    console.error(`create actor failed (${res.status}): ${text}`);
    process.exit(1);
  }
}
if (!actorId) {
  console.error(`no actor_id in response: ${text}`);
  process.exit(1);
}

const wsUrl = `${wsOrigin}/gateway/${encodeURIComponent(actorId)}@${encodeURIComponent(token)}/`;
writeFileSync(new URL("./.last-cloud-actor-id", import.meta.url), actorId);
writeFileSync(new URL("./.last-cloud-ws-url", import.meta.url), wsUrl);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ actor_id: actorId, ws_url: wsUrl, websocket_subprotocol: "rivet" }, null, 2));
} else {
  console.log(`ACTOR_ID=${actorId}`);
  console.log(`ACTOR_WS_URL=${wsUrl}`);
}

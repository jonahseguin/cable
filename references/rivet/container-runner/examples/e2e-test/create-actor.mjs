// Create an actor. This makes it "pending", so the engine POSTs /api/rivet/start to
// the serverless endpoint (the game container), which spawns the child game server.
//
// POST /actors?namespace=default   (no auth)
// The opaque `input` (base64) carries the child launch params decoded by container-runner.
import { writeFileSync } from "node:fs";
import { encode as cborEncode } from "cbor-x";
import {
  ENGINE,
  ENGINE_PUBLIC,
  NAMESPACE,
  ACTOR_NAME,
  RUNNER_NAME,
  actorGatewayHttpUrl,
  actorGatewayPath,
  actorGatewayWsUrl,
} from "./common.mjs";

const key = process.env.ACTOR_KEY || "match-1";
const outputJson = process.argv.includes("--json") || process.env.CREATE_ACTOR_OUTPUT === "json";

// container-runner decodes this from the actor input as CBOR (the RivetKit wire
// encoding). Override the whole object via ACTOR_INPUT (JSON) to exercise
// command/args/env/port; defaults to { port: 7770 }.
const inputJson = process.env.ACTOR_INPUT
  ? JSON.parse(process.env.ACTOR_INPUT)
  : { port: 7770 };
const input = Buffer.from(cborEncode(inputJson)).toString("base64");

const body = {
  name: ACTOR_NAME,
  key,
  input,
  runner_name_selector: RUNNER_NAME,
  crash_policy: process.env.ACTOR_CRASH_POLICY || "destroy",
};

const url = `${ENGINE}/actors?namespace=${encodeURIComponent(NAMESPACE)}`;
if (!outputJson) {
  console.log(`POST ${url}`);
  console.log(`body: ${JSON.stringify(body)}  (input decodes to ${JSON.stringify(inputJson)})`);
}

const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!outputJson) {
  console.log(`status: ${res.status}`);
  console.log(`response: ${text}`);
}
if (!res.ok) process.exit(1);

const data = JSON.parse(text);
const actorId = data.actor?.actor_id;
if (!actorId) {
  console.error("no actor_id in response");
  process.exit(1);
}
const gatewayPath = actorGatewayPath(actorId);
// Raw HTTP reaches the child under the /request/* prefix on the actor surface;
// WebSockets connect at the bare path.
const gatewayHttpUrl = actorGatewayHttpUrl(actorId, "/request/");
const gatewayWsUrl = actorGatewayWsUrl(actorId);

writeFileSync(new URL("./.last-actor-id", import.meta.url), actorId);
writeFileSync(new URL("./.last-actor-gateway-path", import.meta.url), gatewayPath);
writeFileSync(new URL("./.last-actor-http-url", import.meta.url), gatewayHttpUrl);
writeFileSync(new URL("./.last-actor-ws-url", import.meta.url), gatewayWsUrl);

const result = {
  actor_id: actorId,
  actor_key: key,
  engine_api_url: ENGINE,
  engine_public_url: ENGINE_PUBLIC,
  gateway_path: gatewayPath,
  http_url: gatewayHttpUrl,
  ws_url: gatewayWsUrl,
  websocket_subprotocol: "rivet",
};

if (outputJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`\nACTOR_ID=${actorId}`);
  console.log(`ACTOR_HTTP_URL=${gatewayHttpUrl}`);
  console.log(`ACTOR_WS_URL=${gatewayWsUrl}`);
  console.log("ACTOR_WS_SUBPROTOCOL=rivet");
}

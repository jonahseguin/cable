// Connect a WebSocket THROUGH the Rivet guard to the actor, proving the tunnel reaches
// the child game server. The guard routes /gateway/<actor_id>/<path> to the actor's
// runner (container-runner), which proxies to the child's local ws port.
//
// Usage: node ws-test-client.mjs [actor_id]   (falls back to .last-actor-id)
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { actorGatewayWsUrl } from "./common.mjs";

const actorId =
  process.argv[2] ||
  readFileSync(new URL("./.last-actor-id", import.meta.url), "utf8").trim();

const url = actorGatewayWsUrl(actorId);
console.log(`connecting: ${url}`);

const received = [];
const TEST_MSG = "hello from e2e";

// Rivet's guard requires a `sec-websocket-protocol` header on actor WebSockets. For
// path-based routing the actor id is already in the path, so we just need the header
// present (an auth token would be `rivet_token.<token>`; skip-ready-wait is optional).
const ws = new WebSocket(url, ["rivet"]);

const timeout = setTimeout(() => {
  console.error(`\nFAIL: timed out. received so far: ${JSON.stringify(received)}`);
  process.exit(1);
}, 15000);

ws.on("open", () => {
  console.log("ws open -> sending test message");
  ws.send(TEST_MSG);
});

ws.on("message", (data) => {
  const text = data.toString();
  received.push(text);
  console.log(`recv: ${text}`);
  // Success once we've seen the echo of our message (test-server replies "echo: <msg>").
  if (text === `echo: ${TEST_MSG}`) {
    clearTimeout(timeout);
    console.log("\nPASS: tunnel round-trip through Rivet guard -> container-runner -> child succeeded");
    ws.close();
    process.exit(0);
  }
});

ws.on("error", (err) => {
  clearTimeout(timeout);
  console.error(`\nFAIL: ws error: ${err?.message ?? err}`);
  process.exit(1);
});

ws.on("close", (code, reason) => {
  console.log(`ws closed (code=${code} reason=${reason})`);
});

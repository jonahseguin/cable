#!/usr/bin/env bash
# Host-based e2e with the REAL Unity FishNet + Bayou server as the container-runner's
# child (instead of the Node stub). Proves the container-runner hosts an actual Unity
# dedicated server, and that a FishNet client connects through the Rivet guard tunnel.
#
# Requires: an activated Unity license + the demo build (container-runner/examples/unity-demo/setup-and-build.sh demo).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
E2E="$(dirname "$HERE")"
ROOT="$(cd "$E2E/../../.." && pwd)"
RUNNER_BIN="$ROOT/target/release/rivet-container-runner"
ENGINE_BIN="${ENGINE_BINARY:-$ROOT/target/debug/rivet-engine}"
[ -x "$ENGINE_BIN" ] || (cd "$ROOT" && cargo build -p rivet-engine)
[ -x "$RUNNER_BIN" ] || (cd "$ROOT" && cargo build --release -p rivet-container-runner)
LOGS="$E2E/.host-logs"
export ENGINE_URL="http://127.0.0.1:7420"
SERVERLESS_PORT="${SERVERLESS_PORT:-18080}"
CHILD_PORT="${CHILD_PORT:-7770}"
export SERVERLESS_URL="http://127.0.0.1:${SERVERLESS_PORT}/api/rivet"
mkdir -p "$LOGS"

# Locate the Unity demo build (macOS .app inner binary).
APP=$(ls -d "$ROOT/container-runner/examples/unity-demo/Builds/DemoMac/"*.app 2>/dev/null | head -1)
[ -n "$APP" ] || { echo "No Unity build found. Run: container-runner/examples/unity-demo/setup-and-build.sh demo"; exit 1; }
GAME_BIN=$(ls "$APP/Contents/MacOS/"* 2>/dev/null | head -1)
[ -x "$GAME_BIN" ] || { echo "No executable inside $APP"; exit 1; }
echo "Unity server binary: $GAME_BIN"

ENGINE_PID=""; RUNNER_PID=""; CLIENT_PID=""
cleanup() {
  [ -n "$CLIENT_PID" ] && kill "$CLIENT_PID" 2>/dev/null || true
  [ -n "$RUNNER_PID" ] && kill "$RUNNER_PID" 2>/dev/null || true
  [ -n "$ENGINE_PID" ] && kill "$ENGINE_PID" 2>/dev/null || true
  sleep 1; pkill -f "$GAME_BIN" 2>/dev/null || true
}
trap cleanup EXIT
pkill -f "$GAME_BIN" 2>/dev/null || true

echo "==> Starting engine"
rm -rf "$E2E/.host-data"; mkdir -p "$E2E/.host-data"
RIVET__FILE_SYSTEM__PATH="$E2E/.host-data" "$ENGINE_BIN" start --config "$HERE/config.jsonc" > "$LOGS/engine.log" 2>&1 &
ENGINE_PID=$!
for _ in $(seq 1 40); do curl -sf http://127.0.0.1:7421/health >/dev/null 2>&1 && break; sleep 1; done
curl -sf http://127.0.0.1:7421/health >/dev/null 2>&1 || { echo "engine failed; see $LOGS/engine.log"; tail -20 "$LOGS/engine.log"; exit 1; }

echo "==> Starting container-runner wrapping the Unity FishNet server"
# Unity server takes a few seconds to boot; give readiness a generous window.
PORT="$SERVERLESS_PORT" CHILD_PORT="$CHILD_PORT" RIVET_ACTOR_NAME=game RUST_LOG=info RIVET_READINESS_TIMEOUT_SECS=60 \
  "$RUNNER_BIN" -- "$GAME_BIN" -batchmode -nographics -logFile - > "$LOGS/runner-fishnet.log" 2>&1 &
RUNNER_PID=$!
for _ in $(seq 1 20); do curl -sf "http://127.0.0.1:${SERVERLESS_PORT}/api/rivet/health" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "http://127.0.0.1:${SERVERLESS_PORT}/api/rivet/health" >/dev/null 2>&1 || { echo "container-runner failed; see $LOGS/runner-fishnet.log"; tail -20 "$LOGS/runner-fishnet.log"; exit 1; }

echo "==> Configuring pool -> $SERVERLESS_URL + creating actor (spawns the Unity server)"
node "$E2E/configure-serverless.mjs" >/dev/null
ACTOR_KEY="fishnet-$$" node "$E2E/create-actor.mjs" --json > "$LOGS/create-fishnet.json"
ACTOR_ID="$(cat "$E2E/.last-actor-id")"
ACTOR_WS_URL="$(cat "$E2E/.last-actor-ws-url")"
echo "    actor=$ACTOR_ID"
echo "    url=$ACTOR_WS_URL"

echo "==> Waiting for the Unity server to become ready (Bayou ws on $CHILD_PORT)"
for _ in $(seq 1 60); do grep -q 'child is ready' "$LOGS/runner-fishnet.log" && break; sleep 1; done
grep -q 'child is ready' "$LOGS/runner-fishnet.log" \
  && echo "    Unity server up (container-runner reports ready)" \
  || { echo "    Unity server did not become ready; see $LOGS/runner-fishnet.log"; tail -20 "$LOGS/runner-fishnet.log"; exit 1; }

echo "==> Running a FishNet client THROUGH Rivet guard ($ACTOR_WS_URL)"
"$GAME_BIN" -batchmode -nographics -client -url "$ACTOR_WS_URL" -subprotocol rivet -logFile - > "$LOGS/client-fishnet.log" 2>&1 &
CLIENT_PID=$!
sleep 12   # allow Unity client boot + guard tunnel + FishNet connect

echo
echo "==> Results:"
RESULT=0
grep -q 'CLIENT CONNECTED' "$LOGS/client-fishnet.log"          && echo "    PASS  FishNet client connected through Rivet"          || { echo "    FAIL  client did not connect"; RESULT=1; }
grep -q 'SERVER ACCEPTED CLIENT' "$LOGS/runner-fishnet.log"    && echo "    PASS  Unity server accepted FishNet client" || { echo "    FAIL  server did not accept client"; RESULT=1; }

echo
echo "==> container-runner logs (child = Unity server, prefixed [actorId=.. key=..]):"
grep -E 'runner:|actorId=|Bayou|SERVER STARTED|SERVER ACCEPTED CLIENT|listening|spawned|ready' "$LOGS/runner-fishnet.log" | tail -20
exit "$RESULT"

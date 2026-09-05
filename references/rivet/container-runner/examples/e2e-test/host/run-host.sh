#!/usr/bin/env bash
# Host-based end-to-end: run the Rivet engine + container-runner natively on this host
# (no Docker), then drive the full flow. Everything talks over loopback, so the engine's
# HTTP client reaches the container-runner normally (unlike Docker Desktop on macOS).
#
#   engine (:7420 guard, :7421 api) + container-runner (:18080 front door -> child :7770)
#   configure serverless pool -> create actor -> engine POST /start -> child spawns
#   ws client -> guard /gateway/<id>/ -> tunnel -> container-runner -> child (echo)
#
# Usage: container-runner/examples/e2e-test/host/run-host.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"        # .../e2e-test/host
E2E="$(dirname "$HERE")"                       # .../e2e-test
ROOT="$(cd "$E2E/../../.." && pwd)"            # rivet repo root
DATA="$E2E/.host-data"
LOGS="$E2E/.host-logs"
RUNNER_BIN="$ROOT/target/release/rivet-container-runner"
ENGINE_BIN="${ENGINE_BINARY:-$ROOT/target/debug/rivet-engine}"
GUARD_PORT="${GUARD_PORT:-7420}"
API_PORT="${API_PORT:-7421}"
FRONT_PORT="${FRONT_PORT:-18080}"
CHILD_PORT="${CHILD_PORT:-7770}"
ENGINE_URL="http://127.0.0.1:${GUARD_PORT}"

mkdir -p "$DATA" "$LOGS"

ENGINE_PID=""; RUNNER_PID=""
cleanup() {
  echo "==> Cleaning up"
  [ -n "$RUNNER_PID" ] && kill "$RUNNER_PID" 2>/dev/null || true
  [ -n "$ENGINE_PID" ] && kill "$ENGINE_PID" 2>/dev/null || true
  # container-runner SIGTERMs its child; give it a moment, then reap stragglers.
  sleep 1
  pkill -f "$ROOT/container-runner/examples/test-server/server.mjs" 2>/dev/null || true
}
trap cleanup EXIT

# ---- ensure binaries ----
if [ ! -x "$ENGINE_BIN" ]; then
  echo "==> Building rivet-engine (debug)"
  (cd "$ROOT" && cargo build -p rivet-engine)
fi
if [ ! -x "$RUNNER_BIN" ]; then
  echo "==> Building container-runner (release)"
  (cd "$ROOT" && cargo build --release -p rivet-container-runner)
fi
if [ ! -d "$ROOT/container-runner/examples/test-server/node_modules" ]; then
  echo "==> Installing test-server deps"
  (cd "$ROOT/container-runner/examples/test-server" && npm install --silent)
fi

# ---- start the engine ----
echo "==> Starting engine (guard :$GUARD_PORT, api :$API_PORT)"
rm -rf "$DATA"; mkdir -p "$DATA"
RIVET__FILE_SYSTEM__PATH="$DATA" "$ENGINE_BIN" start --config "$HERE/config.jsonc" \
  > "$LOGS/engine.log" 2>&1 &
ENGINE_PID=$!
for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1 && break; sleep 1
done
curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1 || { echo "engine failed; see $LOGS/engine.log"; tail -20 "$LOGS/engine.log"; exit 1; }
echo "    engine healthy: $(curl -s http://127.0.0.1:${API_PORT}/health)"

# ---- start container-runner (wrapping the Node test server) ----
echo "==> Starting container-runner (front door :$FRONT_PORT, child :$CHILD_PORT)"
PORT=$FRONT_PORT CHILD_PORT=$CHILD_PORT RIVET_ACTOR_NAME=game RUST_LOG=info \
  "$RUNNER_BIN" -- node "$ROOT/container-runner/examples/test-server/server.mjs" > "$LOGS/runner.log" 2>&1 &
RUNNER_PID=$!
for _ in $(seq 1 20); do
  curl -sf "http://127.0.0.1:${FRONT_PORT}/api/rivet/health" >/dev/null 2>&1 && break; sleep 1
done
curl -sf "http://127.0.0.1:${FRONT_PORT}/api/rivet/health" >/dev/null 2>&1 || { echo "container-runner failed; see $LOGS/runner.log"; tail -20 "$LOGS/runner.log"; exit 1; }
echo "    front door up: $(curl -s http://127.0.0.1:${FRONT_PORT}/api/rivet/health)"

# ---- drive the flow ----
export ENGINE_URL
export SERVERLESS_URL="http://127.0.0.1:${FRONT_PORT}/api/rivet"

echo "==> Configuring serverless pool 'game' -> $SERVERLESS_URL"
node "$E2E/configure-serverless.mjs"

echo "==> Creating actor (triggers engine -> POST /start -> child spawn)"
ACTOR_KEY="host-$$" node "$E2E/create-actor.mjs"
ACTOR_ID="$(cat "$E2E/.last-actor-id")"

echo "==> Waiting for child spawn"
for _ in $(seq 1 30); do grep -q 'spawned' "$LOGS/runner.log" && break; sleep 1; done

echo "==> Connecting a WebSocket through the guard to the actor"
node "$E2E/ws-test-client.mjs" "$ACTOR_ID"
RESULT=$?

echo
echo "==> container-runner logs (child logs carry the [actorId=... key=...] prefix):"
grep -E 'runner:|test-server|actorId=' "$LOGS/runner.log" | tail -25 || tail -25 "$LOGS/runner.log"

echo
[ "$RESULT" = "0" ] && echo "PASS: full host e2e (engine -> container-runner -> child) succeeded." \
  || echo "FAIL: ws round-trip did not complete."
exit $RESULT

#!/usr/bin/env bash
# Connect N FishNet clients to a Unity server running on Rivet Compute.
#
#   RIVET_URL=https://<namespace>:<token>@api.rivet.dev ./e2e-test/run-cloud-clients.sh 3
#
# Copy RIVET_URL from the Rivet dashboard (Connect). Creates one actor, then attaches
# N windowed clients to it through the public Rivet gateway.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
LOGS="$HERE/.host-logs"
COUNT="${1:-3}"
mkdir -p "$LOGS"

[ -n "${RIVET_URL:-}" ] || {
  echo "RIVET_URL is required. Copy it from the Rivet dashboard (Connect):"
  echo "  RIVET_URL='https://<namespace>:<pk_token>@api.rivet.dev' $0 3"
  exit 1
}

APP=$(ls -d "$ROOT/container-runner/examples/unity-demo/Builds/DemoMac/"*.app 2>/dev/null | head -1)
[ -n "$APP" ] || { echo "No Unity demo build. Run: container-runner/examples/unity-demo/setup-and-build.sh demo"; exit 1; }
GAME_BIN=$(ls "$APP/Contents/MacOS/"* | head -1)

pkill -f "unity-demo -client" 2>/dev/null || true

echo "==> creating actor on Rivet Compute"
node "$HERE/create-cloud-actor.mjs" >/dev/null
WS_URL="$(cat "$HERE/.last-cloud-ws-url")"
echo "    actor=$(cat "$HERE/.last-cloud-actor-id")"

# The actor cold-starts on first connect; give the Unity server time to boot.
echo "==> launching $COUNT client(s)"
for n in $(seq 1 "$COUNT"); do
  nohup "$GAME_BIN" -client -url "$WS_URL" -subprotocol rivet -logFile - > "$LOGS/client-cloud-$n.log" 2>&1 &
  echo "    client $n started (pid $!)"
  sleep 3
done

echo "==> waiting for connections"
sleep 12
RESULT=0
for n in $(seq 1 "$COUNT"); do
  log="$LOGS/client-cloud-$n.log"
  if ! grep -aq 'CLIENT CONNECTED' "$log"; then
    echo "    FAIL  client $n never connected (see $log)"; RESULT=1
  elif grep -aq 'connection state: Stopped' "$log"; then
    echo "    FAIL  client $n connected then dropped (see $log)"; RESULT=1
  else
    echo "    PASS  client $n connected and holding"
  fi
done

echo
echo "Server-side confirmation:"
echo "  npx @rivetkit/cli logs --token \$RIVET_CLOUD_TOKEN --namespace <ns> | grep 'SERVER ACCEPTED CLIENT'"
exit "$RESULT"

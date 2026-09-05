#!/usr/bin/env bash
# Comprehensive host-based tests for container-runner: HTTP fetch proxy, input
# command/args/env override, and the full matrix of child lifecycle / crash handling.
#
# Runs the engine once, then for each scenario starts a fresh container-runner, drives
# an actor, and asserts on the runner log + orphan-process checks. All native on the host.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
E2E="$(dirname "$HERE")"
ROOT="$(cd "$E2E/../../.." && pwd)"
RUNNER_BIN="$ROOT/target/release/rivet-container-runner"
ENGINE_BIN="${ENGINE_BINARY:-$ROOT/target/debug/rivet-engine}"
SERVER="$ROOT/container-runner/examples/test-server/server.mjs"
LOGS="$E2E/.host-logs"
export ENGINE_URL="http://127.0.0.1:7420"
export SERVERLESS_URL="http://127.0.0.1:8080/api/rivet"

mkdir -p "$LOGS"
PASS=0; FAIL=0
ok()  { echo "    PASS  $1"; PASS=$((PASS+1)); }
bad() { echo "    FAIL  $1"; FAIL=$((FAIL+1)); }
check()   { if grep -qE "$2" "$1"; then ok "$3"; else bad "$3 (missing /$2/ in $(basename "$1"))"; fi; }
# A running container-runner has "... -- node <server>" in its own argv, so match only
# the actual child (a `node <server>` process), excluding the rivet-container-runner.
no_orphan() {
  local procs
  procs=$(pgrep -fl "$SERVER" 2>/dev/null | grep -v 'rivet-container-runner')
  if [ -n "$procs" ]; then bad "$1 (orphan child: $procs)"; else ok "$1"; fi
}

ENGINE_PID=""; RUNNER_PID=""
cleanup() {
  [ -n "$RUNNER_PID" ] && kill "$RUNNER_PID" 2>/dev/null || true
  [ -n "$ENGINE_PID" ] && kill "$ENGINE_PID" 2>/dev/null || true
  sleep 1; pkill -f "$SERVER" 2>/dev/null || true
}
trap cleanup EXIT

[ -x "$ENGINE_BIN" ] || (cd "$ROOT" && cargo build -p rivet-engine)
[ -x "$RUNNER_BIN" ] || (cd "$ROOT" && cargo build --release -p rivet-container-runner)
[ -d "$ROOT/container-runner/examples/test-server/node_modules" ] || (cd "$ROOT/container-runner/examples/test-server" && npm install --silent)

# ---- engine (once) ----
echo "==> Starting engine"
rm -rf "$E2E/.host-data"; mkdir -p "$E2E/.host-data"
RIVET__FILE_SYSTEM__PATH="$E2E/.host-data" "$ENGINE_BIN" start --config "$HERE/config.jsonc" \
  > "$LOGS/engine.log" 2>&1 &
ENGINE_PID=$!
for _ in $(seq 1 40); do curl -sf http://127.0.0.1:7421/health >/dev/null 2>&1 && break; sleep 1; done
curl -sf http://127.0.0.1:7421/health >/dev/null 2>&1 || { echo "engine failed"; tail "$LOGS/engine.log"; exit 1; }

start_runner() { # $1=logfile  $2=readiness_secs(optional)
  pkill -f "$SERVER" 2>/dev/null || true
  PORT=8080 CHILD_PORT=7770 RIVET_ACTOR_NAME=game RUST_LOG=info \
    RIVET_READINESS_TIMEOUT_SECS="${2:-30}" \
    "$RUNNER_BIN" -- node "$SERVER" > "$1" 2>&1 &
  RUNNER_PID=$!
  for _ in $(seq 1 20); do curl -sf http://127.0.0.1:8080/api/rivet/health >/dev/null 2>&1 && return 0; sleep 1; done
  echo "runner failed to start"; tail "$1"; return 1
}
stop_runner() { [ -n "$RUNNER_PID" ] && kill "$RUNNER_PID" 2>/dev/null; wait "$RUNNER_PID" 2>/dev/null; RUNNER_PID=""; sleep 1; }
create_actor() { ACTOR_KEY="$1" ACTOR_INPUT="$2" ACTOR_CRASH_POLICY="${3:-destroy}" \
  node "$E2E/create-actor.mjs" >/dev/null 2>&1; ACTOR_ID="$(cat "$E2E/.last-actor-id")"; }
destroy_actor() { curl -s -X DELETE "$ENGINE_URL/actors/$1?namespace=default" >/dev/null 2>&1 || true; }
wait_ready() { for _ in $(seq 1 "${2:-15}"); do grep -q 'child is ready' "$1" && return 0; sleep 1; done; }

# =====================================================================================
echo; echo "== Scenario 1: HTTP fetch proxy (GET + POST /reflect through the guard) =="
L="$LOGS/s1.log"; start_runner "$L"
[ -z "${POOL_CONFIGURED:-}" ] && { node "$E2E/configure-serverless.mjs" >/dev/null; POOL_CONFIGURED=1; }
create_actor "fetch-$$" '{"port":7770}'; wait_ready "$L"
# The actor becomes guard-routable shortly after it reports ready; retry briefly.
# rivetkit's actor surface delivers raw HTTP to the child only under the
# /request/* prefix (stripped before proxying); bare paths are framework routes.
for _ in $(seq 1 15); do
  [ "$(curl -s "$ENGINE_URL/gateway/$ACTOR_ID/request/health")" = "healthy" ] && break; sleep 1
done
H=$(curl -s "$ENGINE_URL/gateway/$ACTOR_ID/request/health")
R=$(curl -s "$ENGINE_URL/gateway/$ACTOR_ID/request/")
P=$(curl -s -X POST --data 'hello-body' "$ENGINE_URL/gateway/$ACTOR_ID/request/reflect")
[ "$H" = "healthy" ] && ok "GET /health -> healthy" || bad "GET /health -> '$H'"
[ "$R" = "ok" ] && ok "GET / -> ok" || bad "GET / -> '$R'"
echo "$P" | grep -q '"method":"POST"' && ok "POST method proxied" || bad "POST method ('$P')"
echo "$P" | grep -q '"body":"hello-body"' && ok "POST body proxied" || bad "POST body ('$P')"
check "$L" 'http POST /reflect body="hello-body"' "child saw the proxied POST"
destroy_actor "$ACTOR_ID"; stop_runner

# =====================================================================================
echo; echo "== Scenario 2: input command/args/env/port override =="
L="$LOGS/s2.log"; start_runner "$L"
create_actor "override-$$" "{\"port\":7799,\"command\":[\"node\",\"$SERVER\"],\"args\":[\"--game-arg\"],\"env\":{\"CUSTOM_ENV\":\"cval\",\"GREETING\":\"hi\"}}"
wait_ready "$L"
check "$L" 'on child port 7799' "input.port applied (7799)"
check "$L" 'argv=\["--game-arg"\]' "input.args applied"
check "$L" 'CUSTOM_ENV=cval GREETING=hi' "input.env applied"
destroy_actor "$ACTOR_ID"; stop_runner

# =====================================================================================
# Rivet restarts crashed actors per crash-policy, so the no-leak check is done AFTER
# destroying the actor (stopping the restart loop) — it verifies the container-runner's
# own cleanup, not Rivet's restart behavior.
echo; echo "== Scenario 3: child crashes on start (exit before ready) =="
L="$LOGS/s3.log"; start_runner "$L" 8
create_actor "crash-start-$$" '{"port":7770,"env":{"CRASH_ON_START":"1"}}'
sleep 4
check "$L" 'child exited before becoming ready' "start failure detected"
check "$L" '(child already exited|child stopped|child killed|child exited before becoming ready)' "runner cleaned up the failed child"
destroy_actor "$ACTOR_ID"; sleep 3
no_orphan "no orphan child after start-failure (post-destroy)"
stop_runner

# =====================================================================================
echo; echo "== Scenario 4: child hangs, never opens port (readiness timeout + kill) =="
L="$LOGS/s4.log"; start_runner "$L" 4
create_actor "hang-$$" '{"port":7770,"env":{"HANG_NO_LISTEN":"1"}}'
sleep 8
check "$L" 'did not open port 7770 within' "readiness timeout fired"
check "$L" 'sending SIGTERM to pid' "hung child was signalled"
check "$L" '(child stopped gracefully|child killed)' "hung child was reaped (the key fix)"
destroy_actor "$ACTOR_ID"; sleep 3
no_orphan "no orphan child after readiness timeout (post-destroy)"
stop_runner

# =====================================================================================
echo; echo "== Scenario 5: child crashes mid-session (after ready) =="
L="$LOGS/s5.log"; start_runner "$L"
create_actor "crash-mid-$$" '{"port":7770,"env":{"CRASH_AFTER_MS":"1500"}}'
wait_ready "$L"; sleep 4
check "$L" 'child is ready' "child became ready first"
check "$L" 'child exited unexpectedly' "watchdog reported unexpected exit"
destroy_actor "$ACTOR_ID"; sleep 3
no_orphan "no orphan child after mid-session crash (post-destroy)"
stop_runner

# =====================================================================================
echo; echo "== Scenario 6: graceful actor stop (destroy) SIGTERMs the child =="
L="$LOGS/s6.log"; start_runner "$L"
create_actor "graceful-$$" '{"port":7770}'; wait_ready "$L"
destroy_actor "$ACTOR_ID"; sleep 3
check "$L" 'sending SIGTERM to pid' "on_actor_stop signalled child"
check "$L" 'child stopped gracefully \(status: exit status: 0\)' "child exited cleanly (0)"
no_orphan "no orphan child after graceful stop"
stop_runner

# =====================================================================================
echo; echo "== Scenario 7: container-runner shutdown stops its children =="
L="$LOGS/s7.log"; start_runner "$L"
create_actor "shutdown-$$" '{"port":7770}'; wait_ready "$L"
pgrep -f "$SERVER" >/dev/null && ok "child running before runner shutdown" || bad "child not running"
stop_runner   # SIGTERM the container-runner
sleep 2
# On SIGTERM the runner drains through the engine first, so the child is
# stopped by the actor's own destroy hook; the bulk "stopping N child(ren)"
# sweep line only appears if the engine drain fails.
check "$L" 'sending SIGTERM to pid' "runner stopped its child on shutdown"
no_orphan "no orphan child after runner shutdown"

# =====================================================================================
echo
echo "================= RESULTS: $PASS passed, $FAIL failed ================="
[ "$FAIL" = "0" ] && echo "ALL PASS" || echo "SOME FAILED"
exit $FAIL

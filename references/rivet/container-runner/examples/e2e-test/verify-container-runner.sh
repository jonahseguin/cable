#!/usr/bin/env bash
# Verify the container-runner serves the full serverless contract the Rivet engine
# expects. This exercises the front door from inside the engine container (so it
# proves reachability on the compose network too). Works on any Docker host.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Bringing up engine + game container"
docker compose up -d --build >/dev/null
for _ in $(seq 1 40); do curl -sf http://127.0.0.1:6421/health >/dev/null 2>&1 && break; sleep 1; done

echo "==> Exercising the container-runner contract (GET / /health /metadata) from the engine:"
fail=0
for path in "" health metadata; do
  code=$(docker exec e2e-test-rivet-engine-1 curl -s -m4 -o /tmp/o -w "%{http_code}" "http://game:8080/api/rivet/$path" || echo 000)
  body=$(docker exec e2e-test-rivet-engine-1 sh -c 'head -c 140 /tmp/o')
  printf "    GET /api/rivet/%-9s -> %s  %s\n" "$path" "$code" "$body"
  [ "$code" = "200" ] || fail=1
done

echo
if [ "$fail" = "0" ]; then
  echo "PASS: container-runner serves the serverless contract correctly."
else
  echo "FAIL: one or more endpoints did not return 200."
  exit 1
fi

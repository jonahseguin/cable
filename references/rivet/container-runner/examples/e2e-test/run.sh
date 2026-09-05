#!/usr/bin/env bash
# End-to-end: engine + game container -> configure serverless -> create actor ->
# tunnel a WebSocket through the guard to the child. All amd64.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Bringing up engine + game container (linux/amd64)"
docker compose up -d --build

echo "==> Waiting for engine health (6421)"
for _ in $(seq 1 40); do
  if curl -sf http://127.0.0.1:6421/health >/dev/null 2>&1; then echo "    engine healthy"; break; fi
  sleep 1
done

echo "==> Installing e2e script deps"
npm install --silent

echo "==> Configuring serverless runner pool 'game'"
node configure-serverless.mjs

echo "==> Creating actor (triggers engine -> POST /start -> child spawn)"
node create-actor.mjs

echo "==> Giving the actor a moment to start"
sleep 3

echo "==> Connecting a WebSocket through the guard to the actor"
node ws-test-client.mjs

echo
echo "==> Game container logs (child logs carry the [actorId=... key=...] prefix):"
docker compose logs game 2>&1 | tail -40

echo
echo "Done. Concurrency=1: to test another actor, run: docker compose restart game"

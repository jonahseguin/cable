# e2e-test

Local end-to-end harness: a self-hosted Rivet engine + `container-runner`, driven by a
few scripts. There are two runnable child-server paths:

- `../test-server/` Node.js echo server for proving the generic container-runner tunnel.
- `../unity-demo/` FishNet + Bayou Unity player for proving the real game-server swap.

## What it exercises

```
create actor (POST /actors)
   -> engine POSTs /api/rivet/start to the game container (serverless)
   -> container-runner spawns the child, reports the actor Running
client WebSocket -> engine guard (:6420) /gateway/<actor_id>/
   -> Rivet tunnel -> container-runner -> proxied to child 127.0.0.1:7770
```

Start with the Node child because it removes Unity/FishNet variables from the runner
debugging loop. Once that passes, run the Unity FishNet child with
`host/run-host-fishnet.sh`. Keep both paths working: the Node path catches runner/tunnel
regressions quickly, and the Unity path catches FishNet/Bayou/build regressions.

The local harness treats each actor as one game-container lifetime. To test another
actor in Docker, restart the game service: `docker compose restart game`.

## Run natively on the host (recommended — works on macOS)

```bash
./host/run-host.sh
```

Runs the engine + container-runner directly on the host (no Docker), on dedicated ports
(engine guard `:7420`, front door `:18080`, child `:7770`). It downloads the engine
binary, builds container-runner, starts both, then configures the pool, creates an actor,
and connects a WebSocket through the guard — verifying the **full** loop
(engine → container-runner → child echo). This avoids the Docker Desktop macOS issue
below. Logs land in `.host-logs/`. Override `FRONT_PORT`, `GUARD_PORT`, `API_PORT`, or
`CHILD_PORT` if needed.

## Run the Unity FishNet + Bayou starter on the host

```bash
UNITY=/Applications/Unity/Hub/Editor/6000.5.2f1/Unity.app/Contents/MacOS/Unity \
  ../unity-demo/setup-and-build.sh demo
./host/run-host-fishnet.sh
```

This starts the engine and container-runner natively, wraps the built Unity player as the
child process, creates an actor, waits for Bayou on `:7770`, and launches a FishNet client
through the Rivet guard at `:7420/gateway/<actor_id>/` with WebSocket subprotocol
`rivet`. The FishNet runner uses serverless front door `:18080` by default because
`:8080` is commonly occupied by local development tunnels. Override it with
`SERVERLESS_PORT=<port>` if needed.

The intended client pattern is:

```bash
node create-actor.mjs --json
```

That script calls the engine actor API, writes `.last-actor-id` plus `.last-actor-ws-url`,
and returns JSON containing the public `ws_url` to connect through the Rivet guard. Set
`ENGINE_PUBLIC_URL` when the public guard URL differs from `ENGINE_URL`; otherwise it
defaults to `ENGINE_URL`.

## Run with Docker

```bash
./run.sh
```

which does: `docker compose up -d --build` -> wait for engine health ->
`configure-serverless.mjs` -> `create-actor.mjs` -> `ws-test-client.mjs`, then prints
the game logs (child logs carry the `[actorId=<id> key=<key>]` prefix). Works on a Linux
Docker host; on Docker Desktop for macOS the start→spawn hop fails (see below) — use the
host runner instead.

Individually:

```bash
docker compose up -d --build
node configure-serverless.mjs         # PUT /runner-configs/game (serverless pool -> game:8080)
node create-actor.mjs                 # POST /actors and print the public gateway URL
node ws-test-client.mjs               # ws through the guard to the actor; expects an echo
```

Engine defaults used by the scripts (see `common.mjs`): namespace `default`,
datacenter `default`, admin token `admin`, runner/actor name `game`, guard on
`http://127.0.0.1:6420`, health/api-peer on `:6421`.

## Verify the container-runner alone

```bash
./verify-container-runner.sh
```

Brings up the stack and checks that the container-runner serves the serverless
contract (`GET /`, `/health`, `/metadata`) — from inside the engine container, so it
also proves compose-network reachability. This passes on any Docker host.

## ⚠️ Known limitation on Docker Desktop for macOS

On **Docker Desktop for macOS**, the full `create-actor -> /start -> child spawn` flow
does **not** complete, because the **Rivet engine's async HTTP (reqwest) client cannot
reach the container-runner** over Docker's internal networking in that environment.

This was isolated conclusively:

- `curl` and Node `fetch` from the engine container reach the container-runner on
  **every** topology (bridge IP, bridge DNS `game`, host-gateway, shared netns) — all
  return `200` with correct bodies, including keep-alive / connection reuse.
- The engine's own `reqwest` client reaches **its own ports** (`127.0.0.1:6420`) and the
  **public internet** (`example.com`) fine, but **cannot reach any sibling process** —
  it times out / resets on bridge peers *and* on a shared-netns loopback listener.
- Proof it is not this project's code: the engine's `reqwest` also **fails to reach a
  plain `python -m http.server`** running in the engine's own network namespace, while
  `curl` reaches it (`200`). The container-runner is never the variable.
- Proof it is not CPU emulation: it reproduces identically with **native arm64** images
  for both the engine and the game container (no QEMU/Rosetta), so multi-arch builds do
  not change the outcome.

In other words, the container-runner and the harness are correct; Docker Desktop's
network virtualization on macOS breaks the Rivet engine's outbound HTTP client for
container-to-container traffic specifically.

**Where the full flow works:** running the binaries natively on the host
(`./host/run-host.sh`, verified on macOS), or a normal Linux Docker host (CI, a Linux
VM/server). Rivet Compute deployment still needs to be wired separately.

> Note: the `create-actor -> start -> spawn` path exercises two things the container-runner
> must get right, both handled here: the engine's serverless metadata validation only
> accepts `runtime: "rivetkit"`, and the guard requires a `sec-websocket-protocol` header
> on actor WebSockets (the ws client offers `["rivet"]`).

## Files

- `docker-compose.yml` — engine (`rivetdev/engine:latest`) + game container, amd64.
- `rivet-engine/config.jsonc` — sets the datacenter `public_url` to `rivet-engine:6420`
  so the container-runner connects back to the engine (not to itself).
- `common.mjs` / `configure-serverless.mjs` / `create-actor.mjs` / `ws-test-client.mjs`
  (shared by both the Docker and host runners; honor `ENGINE_URL`, `ENGINE_PUBLIC_URL`,
  and `SERVERLESS_URL`).
- `run.sh` — Docker full flow. `verify-container-runner.sh` — contract check.
- `host/run-host.sh` + `host/config.jsonc` — native host full flow (recommended on macOS).

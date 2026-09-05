# syntax=docker/dockerfile:1
#
# Production game image: the Unity **Linux dedicated server** wrapped by the Rivet
# serverless runner (`rivet-container-runner`). This is the image you deploy to Rivet
# Compute (or any container host: Cloud Run, Fly, a VM, etc.).
#
# The engine cold-starts this container and drives it over the serverless protocol
# (`POST $BASE_PATH/start` on the front-door port). The runner spawns the Unity server
# as its child and proxies Rivet's tunneled traffic to it.
#
# ---- Prerequisites -----------------------------------------------------------------
# Build the Unity Linux server FIRST (needs Unity "Linux Build Support" module):
#   container-runner/examples/unity-demo/setup-and-build.sh linux
#   -> container-runner/examples/unity-demo/Builds/ServerLinux/GameServer  (+ GameServer_Data/, UnityPlayer.so)
#
# ---- Build (from the RIVET REPO ROOT so the workspace and examples are in context) --
#   docker build --platform linux/amd64 -f container-runner/examples/unity-demo/Dockerfile \
#     --build-arg RIVET_RUNNER_VERSION=$(date +%s) -t game-unity:amd64 .
#
# ---- Run locally to smoke-test the front door --------------------------------------
#   docker run --rm -p 8080:8080 game-unity:amd64
#   curl -s localhost:8080/api/rivet/health   # -> ok
#
# ---- Deploy-time env vars (all optional; override in Rivet Compute / your host) -----
#   RIVET_PORT / PORT        Front-door HTTP port. Rivet Compute injects RIVET_PORT; the
#                            runner reads it directly (falls back to PORT). (default 8080)
#   CHILD_PORT               Local port the Unity server listens on. (default 7770)
#   RIVET_ACTOR_NAME         Actor name this runner serves. (default game)
#   RIVET_RUNNER_VERSION     Version reported to the engine for drain-on-deploy. Bump
#                            every deploy (the --build-arg above bakes a default).
#   RIVET_SERVERLESS_BASE_PATH  Serverless base path. (default /api/rivet)
#   RIVET_STOP_GRACE_SECS    SIGTERM->SIGKILL grace for the child. (default 25)
#   RIVET_READINESS_TIMEOUT_SECS  Wait for the child's port to open. (default 30)

# ---- build the serverless runner (linux/amd64) -------------------------------------
FROM --platform=linux/amd64 rust:1-bookworm AS builder
WORKDIR /build
# The crate depends on in-repo workspace crates (rivet-envoy-client), so the whole
# workspace is the build context. Build from the rivet repo root.
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/build/target \
    cargo build --release -p rivet-container-runner --bin rivet-container-runner \
    && cp target/release/rivet-container-runner /usr/local/bin/rivet-container-runner

# ---- runtime: Unity Linux dedicated server + runner --------------------------------
FROM --platform=linux/amd64 debian:bookworm-slim AS runtime

# Unity's headless dedicated server needs glibc + certs. Add more libs here only if the
# server logs a missing shared object at startup (e.g. libgl1 for non-Null gfx paths).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /game

# The serverless runner binary.
COPY --from=builder /usr/local/bin/rivet-container-runner /usr/local/bin/rivet-container-runner

# The Unity Linux dedicated-server build (executable + _Data + UnityPlayer.so).
# Built on the host by: container-runner/examples/unity-demo/setup-and-build.sh linux
COPY container-runner/examples/unity-demo/Builds/ServerLinux/ /game/
RUN chmod +x /game/GameServer

# Runner version is baked as a default; override at deploy time by setting the env var.
ARG RIVET_RUNNER_VERSION=1
ENV RIVET_RUNNER_VERSION=${RIVET_RUNNER_VERSION} \
    CHILD_PORT=7770 \
    RIVET_ACTOR_NAME=game \
    RIVET_SERVERLESS_BASE_PATH=/api/rivet
EXPOSE 8080

# Rivet Compute injects RIVET_PORT for the front door; the runner reads it directly.
# `-logFile -` sends Unity logs to stdout so they show up in the Rivet Compute logs.
ENTRYPOINT ["rivet-container-runner", "--", "./GameServer", "-batchmode", "-nographics", "-logFile", "-"]

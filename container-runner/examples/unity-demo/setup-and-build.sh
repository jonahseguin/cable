#!/usr/bin/env bash
# Resolve packages, wire the simple FishNet starter scene to Bayou, and build the
# headless dedicated server. Requires an ACTIVATED Unity license (sign into Unity Hub).
#
# Usage: unity-demo/setup-and-build.sh [mac|linux]   (default: mac)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-mac}"
UNITY="${UNITY:-/Applications/Unity/Hub/Editor/6000.5.2f1/Unity.app/Contents/MacOS/Unity}"

[ -x "$UNITY" ] || { echo "Unity editor not found at $UNITY (set \$UNITY)"; exit 1; }

run_unity() { # $1 = description; rest = args
  local desc="$1"; shift
  echo "==> Unity: $desc"
  "$UNITY" -batchmode -quit -nographics -projectPath "$HERE" -logFile - "$@" 2>&1 \
    | grep -iE 'error|exception|fail|build|bootstrap|Packages|Bayou|FishNet|Succeeded' | tail -40
}

# 1) First open resolves embedded FishNet and Bayou packages.
run_unity "resolve packages" 

# 2) Create/update the simple starter scene and wire it to Bayou.
run_unity "wire starter scene to Bayou" -executeMethod ProjectBootstrap.Setup

# 3) Build the dedicated server.
case "$TARGET" in
  mac)   run_unity "build macOS server"  -executeMethod BuildScript.BuildServerMac ;;
  linux) run_unity "build Linux server"  -executeMethod BuildScript.BuildServerLinux ;;
  demo)  run_unity "build macOS demo player (server+client)" -executeMethod BuildScript.BuildDemoMac ;;
  *) echo "unknown target $TARGET (use mac|linux|demo)"; exit 1 ;;
esac

echo "==> Done. Server build under container-runner/examples/unity-demo/Builds/"
find "$HERE/Builds" -maxdepth 3 -type f -name 'GameServer*' 2>/dev/null

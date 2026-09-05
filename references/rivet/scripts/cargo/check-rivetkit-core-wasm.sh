#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET="wasm32-unknown-unknown"
CORE_FEATURES="wasm-runtime,sqlite-remote"
BANNED_CRATES=(
	"depot-client"
	"libsqlite3-sys"
	"tokio-tungstenite"
	"mio"
	"nix"
	"reqwest"
	"rivet-pools"
	"rivet-util"
)

cd "$ROOT"

if command -v rustup >/dev/null 2>&1; then
	rustup target add "$TARGET" >/dev/null
fi

echo "checking rivetkit-core for $TARGET"
cargo check \
	-p rivetkit-core \
	--target "$TARGET" \
	--no-default-features \
	--features "$CORE_FEATURES"

tree_log="$(mktemp)"
feature_log="$(mktemp)"
native_envoy_log="$(mktemp)"
native_core_log="$(mktemp)"
trap 'rm -f "$tree_log" "$feature_log" "$native_envoy_log" "$native_core_log"' EXIT

echo "scanning normal wasm dependency tree"
cargo tree \
	-p rivetkit-core \
	--target "$TARGET" \
	--no-default-features \
	--features "$CORE_FEATURES" \
	-e normal >"$tree_log"

for crate in "${BANNED_CRATES[@]}"; do
	if grep -Eq "(^|[[:space:]])${crate//-/\\-}[[:space:]]+v" "$tree_log"; then
		echo "native-only dependency leaked into wasm tree: $crate" >&2
		echo "dependency tree saved at $tree_log" >&2
		trap - EXIT
		exit 1
	fi
done

echo "checking wasm feature graph"
cargo tree \
	-p rivetkit-core \
	--target "$TARGET" \
	--no-default-features \
	--features "$CORE_FEATURES" \
	-e features >"$feature_log"

if grep -Fq 'rivet-envoy-client feature "native-transport"' "$feature_log"; then
	echo "native envoy transport feature leaked into wasm feature graph" >&2
	echo "feature tree saved at $feature_log" >&2
	trap - EXIT
	exit 1
fi

if grep -Fq 'rivetkit-core feature "native-runtime"' "$feature_log"; then
	echo "native runtime feature leaked into wasm feature graph" >&2
	echo "feature tree saved at $feature_log" >&2
	trap - EXIT
	exit 1
fi

echo "verifying native envoy transport is rejected on $TARGET"
if cargo check \
	-p rivet-envoy-client \
	--target "$TARGET" \
	--no-default-features \
	--features native-transport >"$native_envoy_log" 2>&1; then
	echo "expected native envoy transport to fail on $TARGET, but it compiled" >&2
	echo "native transport check log saved at $native_envoy_log" >&2
	trap - EXIT
	exit 1
fi

echo "verifying native core runtime is rejected on $TARGET"
if cargo check \
	-p rivetkit-core \
	--target "$TARGET" \
	--no-default-features \
	--features native-runtime >"$native_core_log" 2>&1; then
	echo "expected native core runtime to fail on $TARGET, but it compiled" >&2
	echo "native runtime check log saved at $native_core_log" >&2
	trap - EXIT
	exit 1
fi

echo "rivetkit-core wasm gate passed"

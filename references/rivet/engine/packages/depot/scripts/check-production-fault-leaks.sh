#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "checking depot release build without depot/test-faults"
cargo check -p depot --release

echo "checking release IR for fault-only symbols"
cargo rustc -p depot --release --target-dir "$tmp_dir/release-target" --lib -- --emit=llvm-ir
shopt -s nullglob
ir_files=("$tmp_dir"/release-target/release/deps/depot-*.ll)
if [[ ${#ir_files[@]} -eq 0 ]]; then
	echo "expected depot LLVM IR output, found none" >&2
	exit 1
fi

if grep -E 'DepotFault(Action|Controller|Point)|DropArtifact|MAX_FAULT_DELAY|disable_planning_timers' "${ir_files[@]}" >/dev/null; then
	echo "fault-injection symbol leaked into normal release IR" >&2
	grep -n -E 'DepotFault(Action|Controller|Point)|DropArtifact|MAX_FAULT_DELAY|disable_planning_timers' "${ir_files[@]}" >&2
	exit 1
fi

echo "checking normal dependency surface rejects fault APIs"
probe_dir="$tmp_dir/no-feature-probe"
mkdir -p "$probe_dir"

cat >"$probe_dir/main.rs" <<'EOF'
use std::time::Duration;

fn main() {
	let _controller = depot::fault::DepotFaultController::new();
	let _pause = depot::fault::DepotFaultAction::Pause {
		checkpoint: String::new(),
	};
	let _delay = depot::fault::DepotFaultAction::Delay {
		duration: Duration::from_millis(1),
	};
	let _drop = depot::fault::DepotFaultAction::DropArtifact;
	let _input = depot::workflows::compaction::DbManagerInput {
		database_branch_id: depot::conveyer::types::DatabaseBranchId::nil(),
		actor_id: None,
		disable_planning_timers: true,
	};
}
EOF

rlibs=("$tmp_dir"/release-target/release/deps/libdepot-*.rlib)
if [[ ${#rlibs[@]} -ne 1 ]]; then
	echo "expected exactly one no-feature libdepot rlib, found ${#rlibs[@]}" >&2
	exit 1
fi

if rustc \
	--edition=2024 \
	"$probe_dir/main.rs" \
	--emit=metadata \
	-L "dependency=$tmp_dir/release-target/release/deps" \
	--extern "depot=${rlibs[0]}" \
	>"$tmp_dir/probe.out" 2>"$tmp_dir/probe.err"; then
	echo "normal dependency unexpectedly compiled with fault-only APIs" >&2
	exit 1
fi

if ! grep -Eq 'could not find `fault` in `depot`|could not find .*fault.*depot' "$tmp_dir/probe.err"; then
	echo "normal dependency probe failed, but not because depot::fault was hidden" >&2
	cat "$tmp_dir/probe.err" >&2
	exit 1
fi

if ! grep -q 'disable_planning_timers' "$tmp_dir/probe.err"; then
	echo "normal dependency probe did not prove disable_planning_timers was hidden" >&2
	cat "$tmp_dir/probe.err" >&2
	exit 1
fi

echo "checking depot/test-faults is only enabled from dev dependencies"
cargo metadata --format-version 1 --no-deps >"$tmp_dir/metadata.json"
python3 - "$tmp_dir/metadata.json" <<'PY'
import json
import sys

metadata_path = sys.argv[1]
with open(metadata_path, "r", encoding="utf-8") as f:
	metadata = json.load(f)

leaks = []
for package in metadata["packages"]:
	for dep in package.get("dependencies", []):
		if dep.get("name") != "depot":
			continue
		if "test-faults" not in dep.get("features", []):
			continue
		if dep.get("kind") == "dev":
			continue
		leaks.append(f'{package["name"]} depends on depot/test-faults as {dep.get("kind") or "normal"}')

if leaks:
	print("non-dev depot/test-faults dependency leaks found:", file=sys.stderr)
	for leak in leaks:
		print(f"- {leak}", file=sys.stderr)
	sys.exit(1)
PY

echo "production fault-leak checks passed"

#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
cd "$repo_root"

readonly reference_names=(
  trpc
  orpc
  effect
  rivet
  cloudflare-agents
  partyserver
  capnweb
  sock8
)
usage() {
  printf 'Usage: %s <init|update <name> [ref]|status>\n' "${BASH_SOURCE[0]}" >&2
}

lock_value() {
  local name="$1"
  local key="$2"

  sed -n "/^[[:space:]]*\"$name\"[[:space:]]*:/,/^[[:space:]]*}/p" references/lock.json \
    | sed -n "s/^[[:space:]]*\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" \
    | head -n 1
}

subtree_split() {
  local path="$1"
  git log HEAD --format='%B' --grep="git-subtree-dir: $path" -n 1 \
    | sed -n 's/^git-subtree-split: //p' | head -n 1
}

update_lock() {
  local name="$1"
  local commit="$2"
  local temporary

  temporary="$(mktemp "${TMPDIR:-/tmp}/cable-refs-lock.XXXXXX")"
  awk -v target="$name" -v replacement="$commit" '
    $0 ~ "^[[:space:]]*\\\"" target "\\\"[[:space:]]*:" { in_target = 1 }
    in_target && $0 ~ /^[[:space:]]*"commit"[[:space:]]*:/ {
      sub(/"commit"[[:space:]]*:[[:space:]]*"[^"]*"/, "\"commit\": \"" replacement "\"")
      in_target = 0
    }
    { print }
  ' references/lock.json > "$temporary"
  mv "$temporary" references/lock.json
}

known_reference() {
  local candidate="$1"
  local name

  for name in "${reference_names[@]}"; do
    [[ "$name" == "$candidate" ]] && return 0
  done
  return 1
}

reference_status() {
  local name="$1"
  local path="references/$name"
  local split

  if [[ ! -d "$path" ]]; then
    printf '%-22s uninitialized\n' "$path"
    return 1
  fi

  local expected
  expected="$(lock_value "$name" commit)"
  if [[ -z "$expected" ]]; then
    printf '%-22s missing lock entry\n' "$path"
    return 1
  fi

  split="$(subtree_split "$path")"
  if [[ -z "$split" ]]; then
    printf '%-22s %s (subtree metadata unavailable)\n' "$path" "$expected"
    return 1
  fi

  if [[ "$split" != "$expected" ]]; then
    printf '%-22s mismatch: expected %s, found %s\n' "$path" "$expected" "$split"
    return 1
  fi

  printf '%-22s %s\n' "$path" "$expected"
}

status_references() {
  local i
  local failed=0

  for ((i = 0; i < ${#reference_names[@]}; i++)); do
    reference_status "${reference_names[$i]}" || failed=1
  done

  return "$failed"
}

init_references() {
  # Subtrees are committed source, so cloning the parent already initializes them.
  # Keep this command as a cheap, explicit check for agents and new contributors.
  status_references
}

update_references() {
  local selected="${2:-}"
  local source_ref="${3:-main}"
  local name="$selected"
  local path
  local url
  local split

  if [[ -z "$selected" ]]; then
    printf 'The update command requires one reference name.\n' >&2
    return 2
  fi

  if ! known_reference "$selected"; then
    printf 'Unknown reference: %s\n' "$selected" >&2
    return 2
  else
    reference_status "$selected"
  fi

  path="references/$name"
  url="$(lock_value "$name" url)"
  git subtree pull \
    --prefix="$path" \
    "$url" "$source_ref" --squash
  split="$(subtree_split "$path")"
  if [[ -z "$split" ]]; then
    printf 'Could not read the new subtree pin for %s.\n' "$path" >&2
    return 1
  fi
  update_lock "$name" "$split"
  printf 'Updated %s to %s\n' "$path" "$split"
}

command="${1:-init}"
case "$command" in
  init) init_references ;;
  update) update_references "$@" ;;
  status) status_references ;;
  -h|--help) usage ;;
  *) usage; exit 2 ;;
esac

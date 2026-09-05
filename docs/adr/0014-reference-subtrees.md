# 0014: Vendor references as squashed Git subtrees

Status: accepted for M0, 2026-09-05. Supersedes DESIGN section 3.3's submodules.

The user's setup request explicitly points to the Effect article's subtree pattern.
Store each reference as a squashed subtree under `references/`, with upstream URL
and commit in `references/lock.json`. A normal clone contains the source without
submodule initialization. Preserve upstream licenses and keep the source out of
workspace discovery, checks, editor auto-imports, and default searches.

Use `scripts/refs.sh` for status and deliberate updates. Keep full source snapshots,
including Rivet, so the recorded commit identifies an unmodified upstream tree.
This increases the checkout size but avoids a bespoke filtered snapshot format.
The source is research material; packages must never import from it.

The PartyServer implementation moved out of the Agents repository, so include
`cloudflare/partykit` separately. Current path and license corrections belong in
`references/README.md`; do not repeat stale paths from the original handoff.

Source: [Effect's vendoring article](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive).

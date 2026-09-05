# anti-slop provenance

This directory vendors the generic Oxlint plugin from
[`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop) release `v0.1.2`,
commit `e8c4880471b23ab7f216fba7b27d173a6ef07d4c`.

The source is kept local because upstream explicitly distributes the rules for
vendoring and project-specific maintenance. Update it by reviewing a new
upstream release, replacing the copied sources, updating this commit, and
running `pnpm check`.

The optional Effect rules remain copied for parity with upstream but are not
enabled until the Effect milestone.

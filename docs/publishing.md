# Publishing cable

Publishing is deliberately blocked until the remaining release prerequisites in this document are complete. MIT is selected, and the `cablejs` npm organization is owned by `j0nah`.

## Before the first release

1. Keep the verified `cablejs` organization ownership separate from registry availability checks. Ownership is established; package publication is not.
2. Keep `@cablejs/rivet` withheld until M6 hibernation conformance passes. `@cablejs/conformance` is an internal test suite. `@cablejs/effect` is an artifact candidate, with its current Effect 4 RC peer support reviewed before publication.
3. Prepare versions in a reviewed commit with `bunx changeset version`. Deliberately change selected package manifests from `private: true`, choose final versions, and set Changesets access to public packages in that commit.
4. Make the GitHub repository public before relying on public npm provenance.
5. Keep the `npm` GitHub environment absent until the repository plan supports required reviewers. On 2026-09-07, GitHub rejected the guarded environment request with HTTP 422 because this private repository does not support that rule. GitHub created an unprotected environment despite the rejection; it was deleted and the environment list was verified empty. Do not create an unprotected fallback.

## Trusted publishing bootstrap

npm trusted publishing uses GitHub Actions OpenID Connect. It needs Node 22.14 or newer, npm CLI 11.5.1 or newer, and the workflow `id-token: write` permission. The release workflow already declares these requirements and does not accept an npm token fallback.

Trusted publishing must be configured against an existing npm package. The first release therefore needs a deliberate, manual bootstrap by an authorized npm owner. After that publication, configure npm trusted publishing for this repository and the `Release` workflow. Do not add a long-lived `NPM_TOKEN` as a workaround.

## Artifact audit

Run this while packages are still private to inspect the M1 through M5 candidates without contacting npm:

```sh
bun scripts/release-artifacts.ts --all-eligible
```

The audit builds packages in dependency order, runs `bun pm pack`, and verifies a second build produces byte-identical archives. It rejects vendored or reference material, checks every export target and declaration file, rejects a packed `workspace:` dependency, and requires each internal packed dependency to use its exact release version. It then imports each extracted tarball through its published entry point. Cloudflare's workerd suite resolves the extracted public entry and its packed Cable dependencies through explicit aliases, so it cannot fall back to workspace packages. It excludes Rivet and the internal conformance suite.

After the package list and metadata are deliberate, run:

```sh
bun scripts/release-readiness.ts
bun scripts/release-artifacts.ts --configured
```

## Release workflow

`.github/workflows/release.yml` runs only when manually dispatched from `main`. Its readiness job stops before npm writes when package selection, visibility, licensing, or metadata are incomplete. The publish job refers to an `npm` GitHub environment. That environment and its protection rules are not configured by this repository; an operator must create and protect it before release. A missing environment must not be treated as protected.

The publish job audits Bun-generated tarballs from the committed release versions and publishes those exact tarballs with provenance enabled in dependency order. Before publishing, it compares each registry version's integrity and SHA-1 checksum with the archive. Matching versions are skipped for a safe retry; mismatches and non-404 lookup errors stop the run before any new publish. Changesets does not run in this workflow and does not create tags. The workflow does not create GitHub releases, credentials, or a fallback publishing path.

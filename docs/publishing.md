# Publishing cable

Publishing is deliberately blocked until the remaining release prerequisites in this document are complete. MIT is selected, and the `cablejs` npm organization is owned by `j0nah`.

## Before the first release

1. Keep the verified `cablejs` organization ownership separate from registry availability checks. Ownership is established; package publication is not.
2. Keep `@cablejs/rivet` withheld until M6 hibernation conformance passes. `@cablejs/conformance` is an internal test suite. `@cablejs/effect` is an artifact candidate, with its current Effect 4 RC peer support reviewed before publication.
3. Prepare versions in a reviewed commit with `bunx changeset version`. Deliberately change selected package manifests from `private: true`, choose final versions, and set Changesets access to public packages in that commit.
4. Make the GitHub repository public before relying on public npm provenance.
5. Create and protect the `npm` GitHub environment before enabling the publish job. Required reviewers belong on that environment; do not create an unprotected fallback.

## Changesets and GitHub releases

`.github/workflows/changesets.yml` runs on pushes to `main`. It uses the
official [Changesets GitHub Action](https://github.com/changesets/action) to
create or update one version pull request. `bunx changeset version` consumes
the reviewed changesets and writes package `CHANGELOG.md` files with
`@changesets/changelog-github`; the workflow does not publish packages or make
GitHub releases.

The manual `.github/workflows/release.yml` remains the only publishing entry
point. After its artifact audit and OIDC publish succeed, it creates one
GitHub release per published package with generated notes and a tag in the
form `@cablejs/package@version`. Existing releases are skipped so a retry does
not duplicate them. A release failure after npm publication is therefore
retryable without republishing a matching archive.

## Trusted publishing bootstrap

npm trusted publishing uses GitHub Actions OpenID Connect. It needs Node 22.14 or newer, npm CLI 11.5.1 or newer, and the workflow `id-token: write` permission. The release workflow already declares these requirements and does not accept an npm token fallback.

Configure one npm trusted publisher for each package in the npm package
settings. The exact GitHub Actions fields are:

- GitHub organization or user: `jonahseguin` (the npm package owner is the `cablejs` organization, owned by `j0nah`)
- Repository: `cable`
- Workflow filename: `release.yml`
- Environment name: `npm`

The first-package limitation is that npm exposes trusted-publisher settings on
an existing package. An npm owner must create each package and configure this
publisher once before the workflow can publish it. That bootstrap does not add
an npm token path to the repository. The workflow uses `id-token: write`, npm
CLI OIDC detection, and no `NPM_TOKEN` fallback. npm supports this trust
relationship from a private GitHub repository, but it will not generate a
public provenance attestation until the repository and package are public. See
npm's [trusted publishing documentation](https://docs.npmjs.com/trusted-publishers)
for the current provider fields and version requirements.

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

The publish job audits Bun-generated tarballs from the committed release versions and publishes those exact tarballs with provenance enabled in dependency order. Before publishing, it compares each registry version's integrity and SHA-1 checksum with the archive. Matching versions are skipped for a safe retry; mismatches and non-404 lookup errors stop the run before any new publish. Changesets does not run versioning in this workflow and does not create package-version commits. The post-publish release step creates GitHub releases and generated notes; it does not create credentials or a fallback publishing path.

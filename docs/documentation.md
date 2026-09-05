# Documentation plan

Status: planned. The M0 repository contains engineering design material and
package placeholders. Do not publish product guides or examples until their
APIs exist and the examples run.

## Authoring rules

- Code, tests, and wire fixtures decide what the product does. Documentation
  explains that behavior without promising a later milestone.
- Prefer a runnable example over invented output. Keep imports and package
  names aligned with the workspace.
- Keep one canonical copy of protocol and architecture facts. Link to
  `docs/protocol.md` and ADRs instead of paraphrasing rules that can drift.
- Mark future work plainly. Do not write planned packages in the present tense.
- Apply the project-local `unslop` skill to user-facing prose. Use concrete
  claims, sentence-case headings, and enough structure to help scanning.
- Every public page needs a useful title and description. Use Markdown unless
  a Blume component materially helps the reader.

## Blume adoption

Use [Blume](https://useblume.dev/docs) when cable has a user-facing API worth
documenting. Blume requires Node 22.12 or newer, which fits this repository's
Node 22 baseline. It builds static HTML and infers routes, navigation, search,
and page metadata from Markdown files.

Keep Blume at the repository root and use `docs/` as its content root. Configure
`content.exclude` so internal handoff material such as `DESIGN.md`, this file,
and any non-public notes are not published. ADRs and `protocol.md` may be
published once they are written for external readers. This keeps repository
Markdown canonical and avoids a second docs tree.

When adopting it:

1. Pin `blume` to the reviewed current version in the workspace and add root
   `docs:dev`, `docs:build`, and `docs:validate` scripts.
2. Add a small `blume.config.ts` with the project title, description, public
   repository URL, deployment URL, and content exclusions. Let file-based
   navigation work before adding explicit menus.
3. Start with installation, contract definition, procedures, channels,
   adapters, troubleshooting, and protocol concepts. Publish only sections
   backed by their completed milestone.
4. Keep the default generated `llms.txt`, `llms-full.txt`, raw Markdown routes,
   and agent-readability manifest. Draft pages are excluded automatically.
5. Run `blume validate` and `blume build` in CI when the site is added.

Keep the first deployment static. Blume's hosted MCP server and built-in Ask AI
both require server output; Ask AI also creates a public model-backed endpoint.
Consider the read-only MCP server only after the public docs URL is stable.
Enable Ask AI only with an explicit decision covering provider cost, abuse
limits, privacy, and answer quality.

Research checked on 2026-09-05:

- https://useblume.dev/docs/quickstart
- https://useblume.dev/docs/content
- https://useblume.dev/docs/content/navigation
- https://useblume.dev/docs/content/sources
- https://useblume.dev/docs/configuration/ai

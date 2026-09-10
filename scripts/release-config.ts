/**
 * Packages deliberately approved for npm publication.
 *
 * The release workflow still rejects private packages, placeholder versions,
 * and incomplete registry setup before it can publish.
 */
export const artifactCandidates: readonly string[] = [
  "@cablejs/contract",
  "@cablejs/core",
  "@cablejs/client",
  "@cablejs/adapter-memory",
  "@cablejs/adapter-node",
  "@cablejs/cloudflare",
  "@cablejs/react",
  "@cablejs/effect",
  "@cablejs/openapi",
];

export const publishablePackages = artifactCandidates;

/** Packages whose public entry point needs workerd instead of Node.js. */
export const workerdPackages = new Set(["@cablejs/cloudflare"]);

/** Packages excluded from the artifact audit or publication until their status changes. */
export const withheldPackages = new Map<string, string>([
  ["@cablejs/conformance", "This is an internal adapter test suite, not a runtime package."],
  ["@cablejs/rivet", "M6 hibernation conformance is unresolved."],
]);

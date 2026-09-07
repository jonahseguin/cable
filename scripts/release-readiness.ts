import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { publishablePackages, withheldPackages } from "./release-config.js";

const packageManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  private: z.boolean().optional(),
  license: z.string().optional(),
  repository: z.unknown().optional(),
});
const changesetConfigSchema = z.object({
  access: z.string().optional(),
  ignore: z.array(z.string()).optional(),
});
type PackageManifest = z.infer<typeof packageManifestSchema>;
type ChangesetConfig = z.infer<typeof changesetConfigSchema>;

const root = resolve(import.meta.dirname, "..");
const failures: string[] = [];

function manifest(text: string): PackageManifest {
  return packageManifestSchema.parse(JSON.parse(text));
}

function changesetConfig(text: string): ChangesetConfig {
  return changesetConfigSchema.parse(JSON.parse(text));
}

if (publishablePackages.length === 0) {
  failures.push("No packages are approved in scripts/release-config.ts.");
}

const packageFailures = await Promise.all(
  publishablePackages.map(async (name) => {
    const failuresForPackage: string[] = [];
    if (withheldPackages.has(name))
      failuresForPackage.push(`${name} is explicitly withheld: ${withheldPackages.get(name)}`);
    const directory = name.slice("@cablejs/".length);
    try {
      const selected = manifest(
        await readFile(resolve(root, "packages", directory, "package.json"), "utf8"),
      );
      if (selected.private !== false) failuresForPackage.push(`${name} is still private.`);
      if (selected.version === "0.0.0")
        failuresForPackage.push(`${name} still has the placeholder version 0.0.0.`);
      if (
        selected.license === undefined ||
        selected.license === "" ||
        selected.license === "UNLICENSED"
      ) {
        failuresForPackage.push(`${name} has no publishable license field.`);
      }
      if (selected.repository === undefined)
        failuresForPackage.push(`${name} has no repository metadata.`);
    } catch {
      failuresForPackage.push(`${name} does not resolve to packages/${directory}/package.json.`);
    }
    return failuresForPackage;
  }),
);
failures.push(...packageFailures.flat());

const publicWorkspaceFailures = await Promise.all(
  (await readdir(resolve(root, "packages"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const selected = manifest(
        await readFile(resolve(root, "packages", entry.name, "package.json"), "utf8"),
      );
      if (selected.private !== false || publishablePackages.includes(selected.name))
        return undefined;
      const reason = withheldPackages.get(selected.name);
      return reason === undefined
        ? `${selected.name} is public but absent from the release allowlist.`
        : `${selected.name} is public but withheld: ${reason}`;
    }),
);
failures.push(
  ...publicWorkspaceFailures.filter((failure): failure is string => failure !== undefined),
);

try {
  await access(resolve(root, "LICENSE"));
} catch {
  failures.push("The repository has no LICENSE file.");
}

const changesets = changesetConfig(
  await readFile(resolve(root, ".changeset", "config.json"), "utf8"),
);
if (changesets.access !== "public" && changesets.access !== "restricted") {
  failures.push("Changesets access must be deliberately set to public or restricted.");
}
for (const [name, reason] of withheldPackages) {
  if (changesets.ignore?.includes(name) !== true)
    failures.push(`Changesets must ignore ${name}: ${reason}`);
}

if (failures.length > 0) {
  console.error("Release readiness is blocked:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Release metadata is complete. Run the artifact audit before publishing.");
}

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { z } from "zod";

import { publishablePackages } from "./release-config.js";

const releasePlanSchema = z.object({
  artifacts: z.array(z.object({ archive: z.string(), name: z.string(), version: z.string() })),
});
const registryDistSchema = z.object({ "dist.integrity": z.string(), "dist.shasum": z.string() });

interface RegistryVersion {
  readonly integrity: string;
  readonly shasum: string;
}

function run(command: string, args: readonly string[]): string {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function validTag(tag: string): boolean {
  return /^[a-z](?:[a-z0-9._-]*[a-z0-9])?$/.test(tag);
}

function archiveIntegrity(contents: Uint8Array): RegistryVersion {
  return {
    integrity: `sha512-${createHash("sha512").update(contents).digest("base64")}`,
    shasum: createHash("sha1").update(contents).digest("hex"),
  };
}

function existingVersion(name: string, version: string): RegistryVersion | undefined {
  try {
    const result = run("npm", [
      "view",
      `${name}@${version}`,
      "dist.integrity",
      "dist.shasum",
      "--json",
    ]);
    const dist = registryDistSchema.parse(JSON.parse(result));
    return { integrity: dist["dist.integrity"], shasum: dist["dist.shasum"] };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const output = error.message;
    if (output.includes("E404")) return undefined;
    throw new Error(`Registry lookup failed for ${name}@${version}: ${output}`, { cause: error });
  }
}

const [directoryArgument, tag] = process.argv.slice(2);
if (directoryArgument === undefined || tag === undefined || process.argv.length !== 4) {
  throw new Error("Usage: bun scripts/release-publish.ts <artifact-directory> <dist-tag>");
}
if (!validTag(tag)) throw new Error(`Invalid npm dist-tag: ${tag}`);
const distTag = tag;

const directory = resolve(directoryArgument);
const plan = releasePlanSchema.parse(
  JSON.parse(await readFile(resolve(directory, "release-plan.json"), "utf8")),
);
const names = plan.artifacts.map((artifact) => artifact.name);
if (names.length === 0 || names.join("\n") !== publishablePackages.join("\n")) {
  throw new Error(
    "Release plan does not match the configured publish allowlist and dependency order.",
  );
}

const pending = await Promise.all(
  plan.artifacts.map(async (artifact) => {
    if (basename(artifact.archive) !== artifact.archive)
      throw new Error(`Invalid artifact path: ${artifact.archive}`);
    const archive = resolve(directory, artifact.archive);
    if (!archive.startsWith(`${directory}/`))
      throw new Error(`Artifact escapes the release directory: ${artifact.archive}`);
    await access(archive);
    const expected = archiveIntegrity(await readFile(archive));
    const actual = existingVersion(artifact.name, artifact.version);
    if (actual === undefined) return { archive, artifact };
    if (actual.integrity !== expected.integrity || actual.shasum !== expected.shasum) {
      throw new Error(`Registry integrity mismatch for ${artifact.name}@${artifact.version}.`);
    }
    return undefined;
  }),
);

async function publish(index: number): Promise<void> {
  if (index === pending.length) return;
  const next = pending[index];
  if (next !== undefined) run("npm", ["publish", next.archive, "--provenance", "--tag", distTag]);
  await publish(index + 1);
}

await publish(0);

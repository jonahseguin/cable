import { execFileSync, spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { readReleasePlan, validateReleasePlan } from "./release-plan.js";

const [directoryArgument] = process.argv.slice(2);
if (directoryArgument === undefined || process.argv.length !== 3) {
  throw new Error("Usage: bun scripts/release-github.ts <artifact-directory>");
}
if (process.env["GH_TOKEN"] === undefined || process.env["GH_TOKEN"] === "") {
  throw new Error("GH_TOKEN is required to create GitHub releases.");
}

const directory = resolve(directoryArgument);
const plan = await readReleasePlan(directory);
validateReleasePlan(plan);
await Promise.all(
  plan.artifacts.map(async (artifact) => {
    if (basename(artifact.archive) !== artifact.archive)
      throw new Error(`Invalid artifact path: ${artifact.archive}`);
    await access(resolve(directory, artifact.archive));
  }),
);

function releaseExists(tag: string): boolean {
  const result = spawnSync("gh", ["release", "view", tag, "--json", "tagName"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) return true;
  if (result.stderr.includes("release not found") || result.stderr.includes("Release not found"))
    return false;
  throw new Error(`Could not inspect GitHub release ${tag}: ${result.stderr.trim()}`);
}

for (const artifact of plan.artifacts) {
  const tag = `${artifact.name}@${artifact.version}`;
  if (releaseExists(tag)) {
    console.log(`GitHub release ${tag} already exists; skipping.`);
    continue;
  }
  execFileSync(
    "gh",
    [
      "release",
      "create",
      tag,
      "--title",
      `${artifact.name} ${artifact.version}`,
      "--generate-notes",
      "--target",
      process.env["GITHUB_SHA"] ?? "main",
    ],
    { stdio: "inherit" },
  );
}

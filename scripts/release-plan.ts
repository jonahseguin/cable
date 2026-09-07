import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { publishablePackages } from "./release-config.js";

const releasePlanSchema = z.object({
  artifacts: z.array(z.object({ archive: z.string(), name: z.string(), version: z.string() })),
});

export type ReleasePlan = z.infer<typeof releasePlanSchema>;

export async function readReleasePlan(directory: string): Promise<ReleasePlan> {
  return releasePlanSchema.parse(
    JSON.parse(await readFile(resolve(directory, "release-plan.json"), "utf8")),
  );
}

export function validateReleasePlan(plan: ReleasePlan): void {
  const names = plan.artifacts.map((artifact) => artifact.name);
  if (names.length === 0 || names.join("\n") !== publishablePackages.join("\n")) {
    throw new Error(
      "Release plan does not match the configured publish allowlist and dependency order.",
    );
  }
}

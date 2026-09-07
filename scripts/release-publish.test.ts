import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { publishablePackages } from "./release-config.js";

interface Fixture {
  readonly directory: string;
  readonly log: string;
  readonly versions: Readonly<
    Record<string, { readonly integrity: string; readonly shasum: string }>
  >;
}

const root = process.cwd();
const fixtures: string[] = [];

function integrity(contents: string) {
  return {
    integrity: `sha512-${createHash("sha512").update(contents).digest("base64")}`,
    shasum: createHash("sha1").update(contents).digest("hex"),
  } satisfies { readonly integrity: string; readonly shasum: string };
}

async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "cable-release-publish-test-"));
  fixtures.push(directory);
  const versions: Record<string, { readonly integrity: string; readonly shasum: string }> = {};
  const artifacts = await Promise.all(
    publishablePackages.map(async (name, index) => {
      const archive = `artifact-${String(index)}.tgz`;
      const contents = `${name}@1.0.${String(index)}`;
      await writeFile(join(directory, archive), contents);
      const version = `1.0.${String(index)}`;
      versions[`${name}@${version}`] = integrity(contents);
      return { archive, name, version };
    }),
  );
  await writeFile(join(directory, "release-plan.json"), JSON.stringify({ artifacts }));
  return { directory, log: join(directory, "publish.log"), versions };
}

async function fakeNpm(directory: string): Promise<string> {
  const bin = join(directory, "bin");
  const script = join(bin, "npm");
  await mkdir(bin);
  await writeFile(
    script,
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const [command, ...args] = process.argv.slice(2);
const versions = JSON.parse(process.env.CABLE_RELEASE_FAKE_VERSIONS ?? "{}");
if (command === "view") {
  const result = versions[args[0]];
  if (result === undefined) {
    console.error("npm error code E404");
    process.exit(1);
  }
  console.log(JSON.stringify({ "dist.integrity": result.integrity, "dist.shasum": result.shasum }));
  process.exit(0);
}
if (command === "publish") {
  appendFileSync(process.env.CABLE_RELEASE_PUBLISH_LOG, args[0] + "\\n");
  process.exit(0);
}
throw new Error("Unexpected npm command: " + command);
`,
  );
  await chmod(script, 0o755);
  return bin;
}

async function publish(
  fixtureValue: Fixture,
  versions: Readonly<Record<string, { readonly integrity: string; readonly shasum: string }>>,
) {
  const bin = await fakeNpm(fixtureValue.directory);
  return spawnSync("bun", ["scripts/release-publish.ts", fixtureValue.directory, "latest"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CABLE_RELEASE_FAKE_VERSIONS: JSON.stringify(versions),
      CABLE_RELEASE_PUBLISH_LOG: fixtureValue.log,
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
    },
  });
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("release-publish", () => {
  it("publishes every missing archive in dependency order", async () => {
    const value = await fixture();
    await expect(publish(value, {})).resolves.toMatchObject({ status: 0 });
    await expect(readFile(value.log, "utf8")).resolves.toBe(
      publishablePackages
        .map((_name, index) => join(value.directory, `artifact-${String(index)}.tgz`))
        .join("\n") + "\n",
    );
  });

  it("skips matching registry versions", async () => {
    const value = await fixture();
    await expect(publish(value, value.versions)).resolves.toMatchObject({ status: 0 });
    await expect(readFile(value.log, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stops before publishing when an existing archive differs", async () => {
    const value = await fixture();
    const [first] = Object.keys(value.versions);
    if (first === undefined) throw new Error("Fixture has no release versions.");
    const mismatched = {
      ...value.versions,
      [first]: { integrity: "sha512-mismatch", shasum: "mismatch" },
    };
    const result = await publish(value, mismatched);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Registry integrity mismatch");
    await expect(readFile(value.log, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("resumes after an earlier archive is already published", async () => {
    const value = await fixture();
    const firstName = publishablePackages[0];
    if (firstName === undefined) throw new Error("Fixture has no release packages.");
    const first = value.versions[`${firstName}@1.0.0`];
    if (first === undefined) throw new Error("Fixture has no first release version.");
    const result = await publish(value, { [`${firstName}@1.0.0`]: first });
    expect(result.status).toBe(0);
    await expect(readFile(value.log, "utf8")).resolves.toBe(
      publishablePackages
        .slice(1)
        .map((_name, index) => join(value.directory, `artifact-${String(index + 1)}.tgz`))
        .join("\n") + "\n",
    );
  });
});

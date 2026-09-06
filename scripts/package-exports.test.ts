import { readdir, readFile } from "node:fs/promises";

import { expect, it } from "vitest";

interface PackageManifest {
  private: boolean;
  exports: { ".": { types: string; import: string } };
}

function isRootExport(value: unknown): value is PackageManifest["exports"]["."] {
  return (
    typeof value === "object" &&
    value !== null &&
    "types" in value &&
    typeof value.types === "string" &&
    "import" in value &&
    typeof value.import === "string"
  );
}

function isPackageManifest(value: unknown): value is PackageManifest {
  if (typeof value !== "object" || value === null || !("private" in value) || !("exports" in value))
    return false;
  const exports = value.exports;
  return (
    typeof value.private === "boolean" &&
    typeof exports === "object" &&
    exports !== null &&
    "." in exports &&
    isRootExport(exports["."])
  );
}

const directory = new URL("../packages/", import.meta.url);
const packages = (await readdir(directory, { withFileTypes: true })).filter((entry) =>
  entry.isDirectory(),
);

it.each(packages)("builds an importable ESM entry and declarations for $name", async ({ name }) => {
  const root = new URL(`${name}/`, directory);
  const manifest: unknown = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  if (!isPackageManifest(manifest)) throw new Error(`Invalid export map for ${name}`);
  const entry = manifest.exports["."];
  expect(Object.keys(entry)[0]).toBe("types");
  expect(manifest.private).toBe(true);
  if (name !== "cloudflare") {
    await import(new URL(entry.import, root).href);
  }
  await expect(readFile(new URL(entry.types, root), "utf8")).resolves.toEqual(expect.any(String));
});

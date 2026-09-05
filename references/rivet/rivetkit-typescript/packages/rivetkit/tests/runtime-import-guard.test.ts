import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const ALLOWED_BINDING_IMPORTS = new Set([
	"src/registry/napi-runtime.ts",
	"src/registry/wasm-runtime.ts",
]);
const SELF = "tests/runtime-import-guard.test.ts";
const BINDING_IMPORT_PATTERN =
	/@rivetkit\/rivetkit-(?:napi|wasm)|import\(\s*\[\s*["']@rivetkit["']\s*,\s*["']rivetkit-(?:napi|wasm)["']\s*\]/;

async function collectTypeScriptFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "node_modules" || entry.name === "dist") {
					return [];
				}
				return await collectTypeScriptFiles(path);
			}
			if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
				return [];
			}
			return [path];
		}),
	);
	return files.flat();
}

describe("core runtime binding imports", () => {
	test("keeps raw native and wasm binding imports behind runtime adapters", async () => {
		const files = await collectTypeScriptFiles(PACKAGE_ROOT);
		const violations: string[] = [];

		for (const file of files) {
			const rel = relative(PACKAGE_ROOT, file);
			if (rel === SELF || ALLOWED_BINDING_IMPORTS.has(rel)) {
				continue;
			}

			if (BINDING_IMPORT_PATTERN.test(await readFile(file, "utf8"))) {
				violations.push(rel);
			}
		}

		expect(violations).toEqual([]);
	});
});

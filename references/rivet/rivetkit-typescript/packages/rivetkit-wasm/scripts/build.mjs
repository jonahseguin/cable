#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgDir = join(packageDir, "pkg");
const require = createRequire(import.meta.url);

function resolveWasmPackBin() {
	try {
		const packageJsonPath = require.resolve("wasm-pack/package.json", {
			paths: [packageDir],
		});
		return join(dirname(packageJsonPath), "run.js");
	} catch (err) {
		throw new Error(
			"Missing pinned wasm-pack dependency. Run pnpm install before building @rivetkit/rivetkit-wasm.",
			{ cause: err },
		);
	}
}

if (["1", "true"].includes(process.env.SKIP_WASM_BUILD ?? "")) {
	const hasPkg = existsSync(join(pkgDir, "rivetkit_wasm.js"));
	console.log(
		hasPkg
			? "[rivetkit-wasm/build] using existing pkg artifact"
			: "[rivetkit-wasm/build] skipped",
	);
	process.exit(0);
}

const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
const outDirIndex = args.indexOf("--out-dir");

const target = targetIndex >= 0 ? args[targetIndex + 1] : "web";
const outDir = outDirIndex >= 0 ? args[outDirIndex + 1] : "pkg";

if (!target) {
	throw new Error("--target requires a value");
}

if (!outDir) {
	throw new Error("--out-dir requires a value");
}

const cmd = [
	"build",
	"--target",
	target,
	"--out-dir",
	outDir,
	"--out-name",
	"rivetkit_wasm",
];

const wasmPackBin = resolveWasmPackBin();

console.log(`[rivetkit-wasm/build] running: wasm-pack ${cmd.join(" ")}`);
execFileSync(process.execPath, [wasmPackBin, ...cmd], { stdio: "inherit" });

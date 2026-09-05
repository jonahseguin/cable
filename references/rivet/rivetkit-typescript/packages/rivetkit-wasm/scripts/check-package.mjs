#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const requiredFiles = new Set([
	"index.js",
	"index.d.ts",
	"pkg/rivetkit_wasm.js",
	"pkg/rivetkit_wasm.d.ts",
	"pkg/rivetkit_wasm_bg.wasm",
	"pkg/rivetkit_wasm_bg.wasm.d.ts",
	"package.json",
]);

const output = execFileSync(
	"npm",
	["pack", "--json", "--dry-run", "--ignore-scripts"],
	{
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	},
);
const [pack] = JSON.parse(output);
const publishedFiles = new Set(
	pack.files.map((file) => file.path.replace(/\\/g, "/")),
);
const missingFiles = [...requiredFiles].filter((file) => !publishedFiles.has(file));

if (missingFiles.length > 0) {
	throw new Error(
		`@rivetkit/rivetkit-wasm package is missing required files: ${missingFiles.join(", ")}`,
	);
}

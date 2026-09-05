const { build } = require("esbuild");
const fs = require("fs");
const path = require("path");

void main();

async function main() {
	await bundle({
		platform: "node",
		target: "node14",
		format: "cjs",
		outdir: "node/cjs",
	});
	await bundle({
		platform: "node",
		target: "node14",
		format: "esm",
		outdir: "node/esm",
	});
	await bundle({
		platform: "browser",
		format: "esm",
		outdir: "browser/esm",
	});
	await bundle({
		platform: "browser",
		format: "cjs",
		outdir: "browser/cjs",
	});
}

async function bundle({ platform, target, format, outdir }) {
	await runEsbuild({
		platform,
		target,
		format,
		entryPoint: "./src/index.ts",
		outfile: `./dist/${outdir}/index.js`,
	});
	await runEsbuild({
		platform,
		target,
		format,
		entryPoint: "./src/core/index.ts",
		outfile: `./dist/${outdir}/core.js`,
	});
	await runEsbuild({
		platform,
		target,
		format,
		entryPoint: "./src/serialization/index.ts",
		outfile: `./dist/${outdir}/serialization.js`,
	});

	// Mark the output directory's module type. This package has no top-level
	// "type", so without a per-directory marker strict ESM loaders (tsx, vite,
	// Node) treat the bundled .js files as CommonJS and named exports such as
	// `RivetClient` fail to resolve.
	writeTypeMarker(outdir, format);
}

function writeTypeMarker(outdir, format) {
	const type = format === "esm" ? "module" : "commonjs";
	const dir = path.join(__dirname, "dist", outdir);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "package.json"),
		`${JSON.stringify({ type }, null, 2)}\n`,
	);
}

async function runEsbuild({ platform, target, format, entryPoint, outfile }) {
	await build({
		platform,
		target,
		format,
		entryPoints: [entryPoint],
		outfile,
		bundle: true,
		alias: {
			// matches up with tsconfig paths
			"@rivetkit/engine-api": "./src",
		},
		external: [
			"node-fetch",
			"js-base64",
			"qs",
			"url-join",
			"form-data",
			"readable-stream",
		],
	}).catch(() => process.exit(1));
}

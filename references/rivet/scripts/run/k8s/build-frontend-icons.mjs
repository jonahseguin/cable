import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const sourcePath = resolve(
	repoRoot,
	"frontend/packages/icons/src/index.gen.js",
);
const outputPath = resolve(repoRoot, "frontend/packages/icons/dist/index.js");
const resolveFromIcons = createRequire(
	resolve(repoRoot, "frontend/packages/icons/package.json"),
).resolve;

let source = await readFile(sourcePath, "utf8");

source = source.replace(
	/export \{ definition as ([A-Za-z0-9_$]+) \} from "@fortawesome\/pro-[^"]+";/g,
	'export { definition as $1 } from "@fortawesome/free-solid-svg-icons/faSquare";',
);

source = source.replace(
	/export \{ ([^}]+) \} from "@awesome\.me\/[^"]+";/g,
	(_match, exportsList) =>
		exportsList
			.split(",")
			.map((name) => name.trim())
			.filter(Boolean)
			.map(
				(name) =>
					`export { definition as ${name} } from "@fortawesome/free-solid-svg-icons/faSquare";`,
			)
			.join("\n"),
);

source = source.replace(
	/export \{ definition as ([A-Za-z0-9_$]+) \} from "([^"]+)";/g,
	(statement, exportName, moduleName) => {
		try {
			resolveFromIcons(moduleName);
			return statement;
		} catch {
			return `export { definition as ${exportName} } from "@fortawesome/free-solid-svg-icons/faSquare";`;
		}
	},
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, source);
console.log(
	"Generated local @rivet-gg/icons bundle with placeholders for unavailable licensed icons.",
);

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	buildPinnedPnpmDlxArgs,
	createTempPlatformApp,
} from "./shared-platform-harness";

describe("shared platform harness", () => {
	test("builds pinned pnpm dlx commands", () => {
		expect(
			buildPinnedPnpmDlxArgs("wrangler", "4.0.0", ["dev", "--local"]),
		).toEqual(["dlx", "wrangler@4.0.0", "dev", "--local"]);

		expect(() => buildPinnedPnpmDlxArgs("wrangler", "latest")).toThrow(
			"must use a pinned version",
		);
	});

	test("creates and cleans up temporary app directories", () => {
		const app = createTempPlatformApp({
			"src/index.ts": "export default {};",
		});

		try {
			const indexPath = join(app.path, "src", "index.ts");
			expect(readFileSync(indexPath, "utf8")).toBe("export default {};");

			app.writeFile("package.json", '{"type":"module"}');
			expect(readFileSync(join(app.path, "package.json"), "utf8")).toBe(
				'{"type":"module"}',
			);
			expect(() => app.writeFile("../escape.txt", "")).toThrow(
				"escapes app directory",
			);
		} finally {
			app.cleanup();
		}

		expect(existsSync(app.path)).toBe(false);
	});
});

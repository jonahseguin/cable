// @ts-nocheck

import { expect, test } from "vitest";
import { describeDriverMatrix } from "./shared-matrix";
import { setupDriverTest } from "./shared-utils";

describeDriverMatrix(
	"Connection Preflight Disconnect",
	(driverTestConfig) => {
		test("should not call onDisconnect when preflight fails", async (c) => {
			const { client } = await setupDriverTest(c, driverTestConfig);
			const handle = client.connPreflightVisibilityActor.getOrCreate([
				"failed-preflight-disconnect",
				crypto.randomUUID(),
			]);
			const primary = handle.connect({ label: "primary" });
			await primary.snapshot();

			const rejectedBefore = handle.connect({
				label: "rejected-before",
				rejectBefore: true,
			});
			await expect(rejectedBefore.snapshot()).rejects.toThrow();

			const rejectedCreate = handle.connect({
				label: "rejected-create",
				rejectCreate: true,
			});
			await expect(rejectedCreate.snapshot()).rejects.toThrow();

			const snapshot = await primary.snapshot();
			expect(snapshot.disconnectSnapshots).toEqual([]);
			expect(snapshot.visibleLabels).toEqual(["primary"]);

			await primary.dispose();
		});
	},
	{
		encodings: ["bare"],
		runtimes: ["wasm"],
		sqliteBackends: ["remote"],
	},
);

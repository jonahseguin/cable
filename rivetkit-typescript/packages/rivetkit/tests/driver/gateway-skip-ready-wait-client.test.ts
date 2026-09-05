import { describe, expect, test } from "vitest";
import { describeDriverMatrix } from "./shared-matrix";
import { setupDriverTest } from "./shared-utils";

const SKIP_READY_WAIT_HEADER = "x-rivet-skip-ready-wait";
const SKIP_READY_WAIT_PROTOCOL = "rivet_skip_ready_wait";

function websocketProtocols(headers: Record<string, string>): string[] {
	return (headers["sec-websocket-protocol"] ?? "")
		.split(",")
		.map((protocol) => protocol.trim())
		.filter(Boolean);
}

describeDriverMatrix("Gateway Skip Ready Wait Client", (driverTestConfig) => {
	describe("Gateway Skip Ready Wait Client", () => {
		test("action calls can enable and disable gateway skip ready wait", async (c) => {
			const { client } = await setupDriverTest(c, driverTestConfig);

			const enabledView = client.requestAccessActor.getOrCreate([
				"action-skip-ready-wait-enabled",
			]);
			const enabledTracking = client.requestAccessActor.getOrCreate(
				["action-skip-ready-wait-enabled"],
				{ params: { trackRequest: true } },
			);

			await enabledTracking.action({
				name: "ping",
				args: [],
				skipReadyWait: true,
			});

			const enabledInfo = await enabledView.getRequestInfo();
			expect(
				enabledInfo.onBeforeConnect.requestHeaders[
					SKIP_READY_WAIT_HEADER
				],
			).toBe("1");

			const disabledView = client.requestAccessActor.getOrCreate([
				"action-skip-ready-wait-disabled",
			]);
			const disabledTracking = client.requestAccessActor.getOrCreate(
				["action-skip-ready-wait-disabled"],
				{ params: { trackRequest: true } },
			);

			await disabledTracking.action({
				name: "ping",
				args: [],
				skipReadyWait: false,
			});

			const disabledInfo = await disabledView.getRequestInfo();
			expect(
				disabledInfo.onBeforeConnect.requestHeaders[
					SKIP_READY_WAIT_HEADER
				],
			).toBeUndefined();
		});

		test("client gateway skip ready wait default can be overridden per action", async (c) => {
			const { client } = await setupDriverTest(c, driverTestConfig, {
				client: { gateway: { skipReadyWait: true } },
			});

			const defaultView = client.requestAccessActor.getOrCreate([
				"client-action-skip-ready-wait-default",
			]);
			const defaultTracking = client.requestAccessActor.getOrCreate(
				["client-action-skip-ready-wait-default"],
				{ params: { trackRequest: true } },
			);

			await defaultTracking.ping();

			const defaultInfo = await defaultView.getRequestInfo();
			expect(
				defaultInfo.onBeforeConnect.requestHeaders[
					SKIP_READY_WAIT_HEADER
				],
			).toBe("1");

			const overrideView = client.requestAccessActor.getOrCreate([
				"client-action-skip-ready-wait-override",
			]);
			const overrideTracking = client.requestAccessActor.getOrCreate(
				["client-action-skip-ready-wait-override"],
				{ params: { trackRequest: true } },
			);

			await overrideTracking.action({
				name: "ping",
				args: [],
				skipReadyWait: false,
			});

			const overrideInfo = await overrideView.getRequestInfo();
			expect(
				overrideInfo.onBeforeConnect.requestHeaders[
					SKIP_READY_WAIT_HEADER
				],
			).toBeUndefined();
		});

		test("connect can enable gateway skip ready wait for its websocket", async (c) => {
			const { client } = await setupDriverTest(c, driverTestConfig);

			const defaultConn = client.requestAccessActor
				.getOrCreate(["connect-skip-ready-wait-default"], {
					params: { trackRequest: true },
				})
				.connect();

			const defaultInfo = await defaultConn.getRequestInfo();
			expect(
				websocketProtocols(defaultInfo.onBeforeConnect.requestHeaders),
			).not.toContain(SKIP_READY_WAIT_PROTOCOL);
			await defaultConn.dispose();

			const skipReadyWaitConn = client.requestAccessActor
				.getOrCreate(["connect-skip-ready-wait-enabled"], {
					params: { trackRequest: true },
				})
				.connect(undefined, {
					skipReadyWait: true,
				});

			const skipReadyWaitInfo = await skipReadyWaitConn.getRequestInfo();
			expect(
				websocketProtocols(
					skipReadyWaitInfo.onBeforeConnect.requestHeaders,
				),
			).toContain(SKIP_READY_WAIT_PROTOCOL);
			await skipReadyWaitConn.dispose();
		});

		test("client gateway skip ready wait default can be overridden per connect", async (c) => {
			const { client } = await setupDriverTest(c, driverTestConfig, {
				client: { gateway: { skipReadyWait: true } },
			});

			const defaultConn = client.requestAccessActor
				.getOrCreate(["client-connect-skip-ready-wait-default"], {
					params: { trackRequest: true },
				})
				.connect();

			const defaultInfo = await defaultConn.getRequestInfo();
			expect(
				websocketProtocols(defaultInfo.onBeforeConnect.requestHeaders),
			).toContain(SKIP_READY_WAIT_PROTOCOL);
			await defaultConn.dispose();

			const overrideConn = client.requestAccessActor
				.getOrCreate(["client-connect-skip-ready-wait-override"], {
					params: { trackRequest: true },
				})
				.connect(undefined, {
					skipReadyWait: false,
				});

			const overrideInfo = await overrideConn.getRequestInfo();
			expect(
				websocketProtocols(overrideInfo.onBeforeConnect.requestHeaders),
			).not.toContain(SKIP_READY_WAIT_PROTOCOL);
			await overrideConn.dispose();
		});
	});
});

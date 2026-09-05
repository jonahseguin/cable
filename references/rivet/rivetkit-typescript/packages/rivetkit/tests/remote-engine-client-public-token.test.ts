import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ClientConfigSchema } from "@/client/config";
import { createClient } from "@/client/mod";
import {
	HEADER_RIVET_ACTOR,
	HEADER_RIVET_SKIP_READY_WAIT,
	HEADER_RIVET_TARGET,
	HEADER_RIVET_TOKEN,
	WS_PROTOCOL_ACTOR,
	WS_PROTOCOL_SKIP_READY_WAIT,
	WS_PROTOCOL_TARGET,
	WS_PROTOCOL_TOKEN,
} from "@/common/actor-router-consts";
import { RemoteEngineControlClient } from "@/engine-client/mod";

describe.sequential("RemoteEngineControlClient public token usage", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("uses metadata clientToken for actor HTTP gateway requests", async () => {
		const fetchCalls: Request[] = [];
		const fetchMock = vi.fn(async (input: Request | URL | string) => {
			const request = normalizeRequest(input);
			fetchCalls.push(request);

			if (
				request.url ===
				"https://backend-http.example/manager/metadata?namespace=default"
			) {
				return jsonResponse({
					runtime: "rivetkit",
					version: "test",
					runner: { kind: { normal: {} }, version: "test" },
					actorNames: {},
					clientEndpoint: "https://public-http.example/manager",
					clientNamespace: "default",
					clientToken: "public-http-token",
				});
			}

			if (
				request.url ===
				"https://public-http.example/manager/gateway/actor%2Fhttp@public-http-token/status?watch=true"
			) {
				return new Response("ok");
			}

			return new Response("ok");
		});

		vi.stubGlobal("fetch", fetchMock);

		const driver = new RemoteEngineControlClient(
			ClientConfigSchema.parse({
				endpoint:
					"https://default:backend-http-token@backend-http.example/manager",
			}),
		);

		const response = await driver.sendRequest(
			{ directId: "actor/http" },
			new Request("http://actor/status?watch=true", {
				method: "POST",
				headers: {
					"x-user-header": "present",
				},
				body: "payload",
			}),
		);

		expect(response.status).toBe(200);
		expect(fetchCalls).toHaveLength(2);

		const actorRequest = fetchCalls[1];
		expect(actorRequest?.url).toBe(
			"https://public-http.example/manager/gateway/actor%2Fhttp@public-http-token/status?watch=true",
		);
		expect(actorRequest?.headers.get(HEADER_RIVET_TOKEN)).toBe(
			"public-http-token",
		);
		expect(actorRequest?.headers.get("x-user-header")).toBe("present");
	});

	test("sets skip ready wait header for actor HTTP gateway requests", async () => {
		const fetchCalls: Request[] = [];
		const fetchMock = vi.fn(async (input: Request | URL | string) => {
			const request = normalizeRequest(input);
			fetchCalls.push(request);
			return new Response("ok");
		});
		vi.stubGlobal("fetch", fetchMock);

		const driver = new RemoteEngineControlClient(
			ClientConfigSchema.parse({
				endpoint: "https://api.rivet.dev",
				disableMetadataLookup: true,
			}),
		);

		const response = await driver.sendRequest(
			{ directId: "actor-http-skip-ready-wait" },
			new Request("http://actor/request/skip-ready-wait"),
			{ skipReadyWait: true },
		);

		expect(response.status).toBe(200);
		expect(fetchCalls).toHaveLength(1);

		const actorRequest = fetchCalls[0];
		expect(actorRequest?.url).toBe(
			"https://api.rivet.dev/request/skip-ready-wait",
		);
		expect(actorRequest?.headers.get(HEADER_RIVET_TARGET)).toBe("actor");
		expect(actorRequest?.headers.get(HEADER_RIVET_ACTOR)).toBe(
			"actor-http-skip-ready-wait",
		);
		expect(actorRequest?.headers.get(HEADER_RIVET_SKIP_READY_WAIT)).toBe(
			"1",
		);
	});

	test("handle fetch forwards skip ready wait to browser request", async () => {
		const fetchCalls: Request[] = [];
		const fetchMock = vi.fn(async (input: Request | URL | string) => {
			const request = normalizeRequest(input);
			fetchCalls.push(request);
			return new Response("ok");
		});
		vi.stubGlobal("fetch", fetchMock);

		const client = createClient({
			endpoint: "https://api.rivet.dev",
			disableMetadataLookup: true,
		});
		const handle = client.getForId(
			"mockAgenticLoop",
			"actor-http-skip-ready-wait",
		);

		const response = await handle.fetch("/skip-ready-wait", {
			skipReadyWait: true,
		});

		expect(response.status).toBe(200);
		expect(fetchCalls).toHaveLength(1);

		const actorRequest = fetchCalls[0];
		expect(actorRequest?.url).toBe(
			"https://api.rivet.dev/request/skip-ready-wait",
		);
		expect(actorRequest?.headers.get(HEADER_RIVET_TARGET)).toBe("actor");
		expect(actorRequest?.headers.get(HEADER_RIVET_ACTOR)).toBe(
			"actor-http-skip-ready-wait",
		);
		expect(actorRequest?.headers.get(HEADER_RIVET_SKIP_READY_WAIT)).toBe(
			"1",
		);
	});

	test("query handle fetch keeps skip ready wait on gateway URL", async () => {
		const fetchCalls: Request[] = [];
		const fetchMock = vi.fn(async (input: Request | URL | string) => {
			const request = normalizeRequest(input);
			fetchCalls.push(request);
			return new Response("ok");
		});
		vi.stubGlobal("fetch", fetchMock);

		const client = createClient({
			endpoint: "https://api.rivet.dev",
			disableMetadataLookup: true,
			gateway: { skipReadyWait: true },
		});
		const handle = client.getOrCreate("mockAgenticLoop", [
			"query-http-skip-ready-wait",
		]);

		const response = await handle.fetch("/skip-ready-wait");

		expect(response.status).toBe(200);
		expect(fetchCalls).toHaveLength(1);

		const actorRequest = fetchCalls[0];
		expect(actorRequest).toBeDefined();
		if (!actorRequest) throw new Error("missing actor request");
		const url = new URL(actorRequest.url);
		expect(url.pathname).toBe(
			"/gateway/mockAgenticLoop/request/skip-ready-wait",
		);
		expect(url.searchParams.get("rvt-method")).toBe("getOrCreate");
		expect(url.searchParams.get("rvt-key")).toBe(
			"query-http-skip-ready-wait",
		);
		expect(url.searchParams.get("rvt-skip-ready-wait")).toBe("true");
		expect(actorRequest?.headers.get(HEADER_RIVET_TARGET)).toBeNull();
		expect(actorRequest?.headers.get(HEADER_RIVET_ACTOR)).toBeNull();
		expect(actorRequest?.headers.get(HEADER_RIVET_SKIP_READY_WAIT)).toBe(
			"1",
		);
	});

	test("uses metadata clientToken for actor websocket gateway requests", async () => {
		const fetchMock = vi.fn(async (input: Request | URL | string) => {
			const request = normalizeRequest(input);

			if (
				request.url ===
				"https://backend-ws.example/manager/metadata?namespace=default"
			) {
				return jsonResponse({
					runtime: "rivetkit",
					version: "test",
					runner: { kind: { normal: {} }, version: "test" },
					actorNames: {},
					clientEndpoint: "https://public-ws.example/manager",
					clientNamespace: "default",
					clientToken: "public-ws-token",
				});
			}

			throw new Error(`unexpected fetch: ${request.url}`);
		});

		const sockets: FakeWebSocket[] = [];
		vi.stubGlobal("fetch", fetchMock);
		vi.stubGlobal(
			"WebSocket",
			class extends FakeWebSocket {
				constructor(url: string | URL, protocols?: string | string[]) {
					super(url, protocols);
					sockets.push(this);
				}
			},
		);

		const driver = new RemoteEngineControlClient(
			ClientConfigSchema.parse({
				endpoint:
					"https://default:backend-ws-token@backend-ws.example/manager",
			}),
		);

		await driver.openWebSocket(
			"/connect",
			{ directId: "actor/ws" },
			"bare",
			{ room: "lobby" },
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(sockets).toHaveLength(1);
		expect(sockets[0]?.url).toBe(
			"https://public-ws.example/manager/gateway/actor%2Fws@public-ws-token/connect",
		);

		await driver.openWebSocket(
			"/connect",
			{ directId: "actor/ws-skip-ready-wait" },
			"bare",
			{ room: "lobby" },
			{ skipReadyWait: true },
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(sockets).toHaveLength(2);
		expect(sockets[1]?.url).toBe(
			"https://public-ws.example/manager/connect",
		);
		expect(sockets[1]?.protocols).toEqual(
			expect.arrayContaining([
				`${WS_PROTOCOL_TARGET}actor`,
				`${WS_PROTOCOL_ACTOR}actor/ws-skip-ready-wait`,
				`${WS_PROTOCOL_TOKEN}public-ws-token`,
				WS_PROTOCOL_SKIP_READY_WAIT,
			]),
		);

		await driver.openWebSocket(
			"/websocket?room=lobby",
			{ directId: "actor/ws-query" },
			"bare",
			undefined,
			{ skipReadyWait: true },
		);

		expect(sockets).toHaveLength(3);
		expect(sockets[2]?.url).toBe(
			"https://public-ws.example/manager/websocket?room=lobby",
		);
		expect(sockets[2]?.protocols).toEqual(
			expect.arrayContaining([
				`${WS_PROTOCOL_TARGET}actor`,
				`${WS_PROTOCOL_ACTOR}actor/ws-query`,
				`${WS_PROTOCOL_TOKEN}public-ws-token`,
				WS_PROTOCOL_SKIP_READY_WAIT,
			]),
		);

		const client = createClient({
			endpoint: "https://api.rivet.dev",
			disableMetadataLookup: true,
			gateway: { skipReadyWait: true },
		});
		const handle = client.getOrCreate("mockAgenticLoop", [
			"query-ws-skip-ready-wait",
		]);

		await handle.webSocket("/skip-ready-wait");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(sockets).toHaveLength(4);
		const querySocket = sockets[3];
		expect(querySocket).toBeDefined();
		if (!querySocket) throw new Error("missing query websocket");
		const url = new URL(querySocket.url);
		expect(url.pathname).toBe(
			"/gateway/mockAgenticLoop/websocket/skip-ready-wait",
		);
		expect(url.searchParams.get("rvt-method")).toBe("getOrCreate");
		expect(url.searchParams.get("rvt-key")).toBe(
			"query-ws-skip-ready-wait",
		);
		expect(url.searchParams.get("rvt-skip-ready-wait")).toBe("true");
		expect(querySocket.protocols).toContain(WS_PROTOCOL_SKIP_READY_WAIT);
		expect(querySocket.protocols).not.toContain(
			`${WS_PROTOCOL_TARGET}actor`,
		);
	});
});

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: {
			"content-type": "application/json",
		},
	});
}

function normalizeRequest(input: Request | URL | string): Request {
	if (input instanceof Request) {
		return input;
	}

	return new Request(input);
}

class FakeWebSocket {
	static readonly OPEN = 1;
	readonly url: string;
	readonly protocols: string | string[] | undefined;
	readonly readyState = FakeWebSocket.OPEN;
	binaryType = "blob";

	constructor(url: string | URL, protocols?: string | string[]) {
		this.url = String(url);
		this.protocols = protocols;
	}

	addEventListener(): void {}

	removeEventListener(): void {}

	send(): void {}

	close(): void {}
}

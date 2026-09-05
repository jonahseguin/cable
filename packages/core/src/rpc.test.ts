import { describe, expect, it } from "vitest";

import { CableError } from "./errors.js";
import {
  createRpcHandler,
  decodeBatch,
  decodeBatchResponse,
  encodeBatch,
  encodeInput,
  type RpcCall,
  type RpcResult,
  type RpcRuntime,
} from "./rpc.js";

interface TestContext {
  readonly requestId: string;
}

class TestRuntime implements RpcRuntime<TestContext> {
  public readonly seen: Array<{ call: RpcCall; context: TestContext }> = [];

  public async execute(call: RpcCall, context: TestContext): Promise<RpcResult> {
    this.seen.push({ call, context });
    if (call.path === "fail" || call.path === "read-fail") {
      return {
        error: { code: "CONFLICT", message: "Conflict", status: 409 },
        id: call.id,
        ok: false,
      };
    }
    if (call.path === "throw") {
      throw new Error("runtime failure");
    }
    if (call.path === "read-secret") {
      return {
        error: { code: "INTERNAL", message: "database password", status: 500 },
        id: call.id,
        ok: false,
      };
    }
    if (call.path === "read-date") {
      return { data: new Date(0), id: call.id, ok: true };
    }
    return { data: call.input, id: call.id, ok: true };
  }

  public transport(path: string): { readonly cache?: string; readonly method: "GET" } | undefined {
    return path === "read" || path === "read-fail" || path === "read-secret" || path === "read-date"
      ? { cache: "public, max-age=30", method: "GET" }
      : undefined;
  }
}

describe("RPC codec", () => {
  it("round-trips calls and normalizes omitted void values", () => {
    const encoded = encodeBatch({
      calls: [{ id: "one", input: undefined, path: "voidCall" }],
    });

    expect(decodeBatch(encoded)).toEqual({
      calls: [{ id: "one", input: undefined, path: "voidCall" }],
    });
    expect(decodeBatchResponse('{"results":[{"id":"one","ok":true}]}')).toEqual({
      results: [{ data: undefined, id: "one", ok: true }],
    });
  });

  it.each(["null", "{}", '{"calls":{}}', '{"calls":[null]}', '{"calls":[{"id":"","path":"x"}]}'])(
    "rejects malformed batch %s",
    (text) => {
      expect(() => decodeBatch(text)).toThrow(CableError);
    },
  );

  it("rejects malformed result errors", () => {
    expect(() =>
      decodeBatchResponse('{"results":[{"id":"one","ok":false,"error":{"code":"X","status":99}}]}'),
    ).toThrow("invalid error code or status");
  });

  it("rejects duplicate request and response ids", () => {
    expect(() =>
      decodeBatch('{"calls":[{"id":"same","path":"a"},{"id":"same","path":"b"}]}'),
    ).toThrow("duplicate id");
    expect(() =>
      decodeBatchResponse('{"results":[{"id":"same","ok":true},{"id":"same","ok":true}]}'),
    ).toThrow("duplicate id");
  });

  it("encodes JSON-native GET input without silent transformations", () => {
    expect(encodeInput(undefined)).toBeUndefined();
    expect(encodeInput({ page: 2 })).toBe('{"page":2}');
    expect(() => encodeInput(new Date(0))).toThrow("plain objects and arrays");
    expect(() => encodeInput(Number.NaN)).toThrow("non-finite number");
    expect(() => encodeInput([undefined])).toThrow("non-JSON value");
    expect(() =>
      encodeInput(
        Object.defineProperty({}, "computed", {
          enumerable: true,
          get: () => "value",
        }),
      ),
    ).toThrow("transform or omit");
  });
});

describe("createRpcHandler", () => {
  it("executes a mixed POST batch independently and in order", async () => {
    const runtime = new TestRuntime();
    const handler = createRpcHandler(runtime, {
      context: () => ({ requestId: "request-1" }),
    });
    const response = await handler.fetch(
      new Request("https://example.test/_cable/rpc", {
        body: encodeBatch({
          calls: [
            { id: "a", input: 1, path: "ok" },
            { id: "b", input: 2, path: "fail" },
            { id: "c", input: 3, path: "throw" },
            { id: "d", input: 4, path: "ok" },
          ],
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(decodeBatchResponse(await response.text())).toEqual({
      results: [
        { data: 1, id: "a", ok: true },
        {
          error: { code: "CONFLICT", message: "Conflict", status: 409 },
          id: "b",
          ok: false,
        },
        {
          error: { code: "INTERNAL", message: "Internal server error", status: 500 },
          id: "c",
          ok: false,
        },
        { data: 4, id: "d", ok: true },
      ],
    });
    expect(runtime.seen.map(({ call }) => call.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("allows GET only for opted-in procedures and forwards cache policy", async () => {
    const runtime = new TestRuntime();
    const handler = createRpcHandler(runtime, {
      basePath: "/api/",
      context: () => ({ requestId: "request-2" }),
    });
    const response = await handler.fetch(
      new Request("https://example.test/api/rpc/read?input=%7B%22page%22%3A2%7D"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=30");
    expect(await response.json()).toEqual({
      data: { page: 2 },
      id: "get",
      ok: true,
    });

    const rejected = await handler.fetch(
      new Request("https://example.test/api/rpc/write?input=null"),
    );
    expect(rejected.status).toBe(404);
    expect(runtime.seen).toHaveLength(1);
  });

  it("returns a bounded error for malformed batch JSON", async () => {
    const handler = createRpcHandler(new TestRuntime(), {
      context: () => ({ requestId: "request-3" }),
    });
    const response = await handler.fetch(
      new Request("https://example.test/_cable/rpc", { body: "{", method: "POST" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "PARSE_ERROR", message: "Invalid JSON", status: 400 },
    });
  });

  it("rejects duplicate ids and oversized bodies before execution", async () => {
    const runtime = new TestRuntime();
    const handler = createRpcHandler(runtime, {
      context: () => ({ requestId: "request-4" }),
      maxBodyBytes: 120,
    });
    const duplicate = await handler.fetch(
      new Request("https://example.test/_cable/rpc", {
        body: '{"calls":[{"id":"same","path":"a"},{"id":"same","path":"b"}]}',
        method: "POST",
      }),
    );
    const oversized = await handler.fetch(
      new Request("https://example.test/_cable/rpc", {
        body: JSON.stringify({ calls: [], padding: "x".repeat(200) }),
        method: "POST",
      }),
    );

    expect(duplicate.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(runtime.seen).toHaveLength(0);
  });

  it("enforces batch size before creating execution work", async () => {
    const runtime = new TestRuntime();
    const handler = createRpcHandler(runtime, {
      context: () => ({ requestId: "request-batch-limit" }),
      maxBatchSize: 1,
    });
    const response = await handler.fetch(
      new Request("https://example.test/_cable/rpc", {
        body: encodeBatch({
          calls: [
            { id: "one", input: 1, path: "ok" },
            { id: "two", input: 2, path: "ok" },
          ],
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(413);
    expect(runtime.seen).toHaveLength(0);
  });

  it("never applies public caching to GET failures", async () => {
    const handler = createRpcHandler(new TestRuntime(), {
      context: () => ({ requestId: "request-5" }),
    });
    const response = await handler.fetch(
      new Request("https://example.test/_cable/rpc/read-fail?input=null"),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["read-secret", "read-date"])(
    "sanitizes unsupported or internal GET result from %s",
    async (path) => {
      const handler = createRpcHandler(new TestRuntime(), {
        context: () => ({ requestId: "request-get-boundary" }),
      });
      const response = await handler.fetch(
        new Request(`https://example.test/_cable/rpc/${path}?input=null`),
      );

      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe(
        '{"error":{"code":"INTERNAL","message":"Internal server error","status":500}}',
      );
    },
  );
});

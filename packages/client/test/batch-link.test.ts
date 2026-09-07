import { decodeBatch, encodeBatchResponse } from "@cablejs/core";
import type { RpcBatch, RpcResult } from "@cablejs/core";
import { describe, expect, it } from "vitest";

import { batchLink } from "../src/batch-link.js";
import type { LinkContext, NextLink } from "../src/link.js";

const unusedNext: NextLink = () => Promise.reject(new Error("A terminal link must not call next."));

function context(fetch: typeof globalThis.fetch): LinkContext {
  return {
    url: "https://example.test/_cable",
    fetch,
    headers: () => Promise.resolve(new Headers()),
  };
}

function response(batch: RpcBatch): Response {
  return new Response(
    encodeBatchResponse({
      results: batch.calls.map((call) => ({ id: call.id, ok: true, data: call.input })),
    }),
  );
}

describe("HTTP batch link", () => {
  it("flushes at maxBatch, bounds later batches, and correlates out-of-order results", async () => {
    const sizes: number[] = [];
    const link = batchLink({ maxBatch: 2, maxWait: 0 })(
      context(async (url, init) => {
        const request = new Request(url, init);
        expect(request.url).toBe("https://example.test/_cable/rpc");
        expect(request.headers.get("content-type")).toBe("application/json");
        const batch = decodeBatch(await request.text());
        sizes.push(batch.calls.length);
        const results: RpcResult[] = [];
        for (let index = batch.calls.length - 1; index >= 0; index -= 1) {
          const call = batch.calls[index];
          if (call !== undefined) results.push({ id: call.id, ok: true, data: call.input });
        }
        return new Response(encodeBatchResponse({ results }));
      }),
    );
    const results = await Promise.all(
      [1, 2, 3].map((id) => link({ id: String(id), path: "echo", input: id }, unusedNext)),
    );
    expect(sizes).toEqual([2, 1]);
    expect(results).toEqual([1, 2, 3].map((id) => ({ id: String(id), ok: true, data: id })));
  });

  it.each(["missing", "duplicate", "unexpected"])(
    "rejects all calls when response IDs are %s",
    async (mode) => {
      const link = batchLink({ maxBatch: 2 })(
        context(async () => {
          const ids = mode === "missing" ? ["1"] : mode === "duplicate" ? ["1", "1"] : ["1", "3"];
          return new Response(
            JSON.stringify({ results: ids.map((id) => ({ id, ok: true, data: null })) }),
          );
        }),
      );
      const results = await Promise.allSettled(
        ["1", "2"].map((id) => link({ id, path: "echo", input: null }, unusedNext)),
      );
      for (const result of results) {
        expect(result.status).toBe("rejected");
        if (result.status !== "rejected") throw new Error("Expected the malformed batch to fail.");
        expect(result.reason).toMatchObject({ code: "PARSE_ERROR" });
      }
    },
  );

  it("settles transport failures and remains usable for a later batch", async () => {
    let requests = 0;
    const link = batchLink({ maxBatch: 1 })(
      context(async (url, init) => {
        requests += 1;
        if (requests === 1) throw new Error("offline");
        return response(decodeBatch(await new Request(url, init).text()));
      }),
    );
    await expect(link({ id: "1", path: "echo", input: null }, unusedNext)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    await expect(link({ id: "2", path: "echo", input: "back" }, unusedNext)).resolves.toEqual({
      id: "2",
      ok: true,
      data: "back",
    });
  });

  it("does not let a malformed JSON response strand requests", async () => {
    const link = batchLink({ maxBatch: 1 })(context(async () => new Response("{")));
    await expect(link({ id: "1", path: "echo", input: null }, unusedNext)).rejects.toMatchObject({
      code: "PARSE_ERROR",
    });
  });

  it("validates batch options before making requests", () => {
    expect(() => batchLink({ maxBatch: 0 })).toThrow("maxBatch must be a positive integer.");
    expect(() => batchLink({ maxWait: Number.NaN })).toThrow(
      "maxWait must be nonnegative and finite.",
    );
  });
});

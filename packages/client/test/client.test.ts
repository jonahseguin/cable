import { createMemoryLink } from "@cablejs/adapter-memory";
import { c } from "@cablejs/contract";
import { CableError, createRpcHandler, implement } from "@cablejs/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { batchLink, createClient } from "../src/index.js";
import type { Client, Link } from "../src/index.js";

const api = c.contract({
  posts: {
    list: c.query({
      input: z.object({ limit: z.number().int().positive() }),
      output: z.array(z.string()),
    }),
    create: c.mutation({
      input: z.string(),
      output: z.string(),
      errors: { FORBIDDEN: z.object({ reason: z.string() }) },
    }),
    count: c.query({ input: z.void(), output: z.number() }),
  },
  query: {
    nested: c.query({ input: z.string(), output: z.string() }),
  },
});

function procedures() {
  return implement(api)
    .context<{ prefix: string }>()
    .procedures({
      posts: {
        list: ({ input, ctx }) =>
          Array.from({ length: input.limit }, (_, index) => `${ctx.prefix}${index}`),
        create: ({ input }) => {
          if (input === "denied")
            throw new CableError("FORBIDDEN", { data: { reason: "read-only" } });
          return input;
        },
        count: () => 3,
      },
      query: { nested: ({ input }) => input },
    });
}

describe("procedure client over memory", () => {
  it("preserves inferred inputs and outputs without importing a server type", async () => {
    const client = createClient<typeof api>({
      links: [createMemoryLink(procedures(), () => ({ prefix: "post" }))],
    });
    expect(await client.posts.list.query({ limit: 2 })).toEqual(["post0", "post1"]);
    expect(await client.posts.create.mutate("new")).toBe("new");
    expect(await client.posts.count.query()).toBe(3);
    expect(await client.query.nested.query("nested")).toBe("nested");
    expectTypeOf<Client<typeof api>["posts"]["list"]["query"]>().returns.toEqualTypeOf<
      Promise<string[]>
    >();
  });

  it("preserves declared wire errors and reports them without replacing the failure", async () => {
    const errors: Error[] = [];
    const client = createClient<typeof api>({
      links: [createMemoryLink(procedures(), () => ({ prefix: "" }))],
      onError(error) {
        errors.push(error);
        throw new Error("observer failed");
      },
    });
    await expect(client.posts.create.mutate("denied")).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { reason: "read-only" },
    });
    expect(errors).toHaveLength(1);
  });

  it("creates fresh context for each call and composes middleware in order", async () => {
    let calls = 0;
    const order: string[] = [];
    const trace: Link = () => async (call, next) => {
      order.push("before");
      const result = await next(call);
      order.push("after");
      return result;
    };
    const client = createClient<typeof api>({
      links: [trace, createMemoryLink(procedures(), () => ({ prefix: String(++calls) }))],
    });
    expect(await client.posts.list.query({ limit: 1 })).toEqual(["10"]);
    expect(await client.posts.list.query({ limit: 1 })).toEqual(["20"]);
    expect(order).toEqual(["before", "after", "before", "after"]);
  });

  it("runs concurrent mixed results through the actual HTTP codec and refreshed auth", async () => {
    let token = "first";
    const seen: (string | null)[] = [];
    const handler = createRpcHandler(procedures(), {
      context(request) {
        seen.push(request.headers.get("authorization"));
        return { prefix: "http" };
      },
    });
    const client = createClient<typeof api>({
      url: "https://example.test/_cable",
      fetch: (url, init) => handler.fetch(new Request(url, init)),
      auth: { token: () => token },
    });
    const results = await Promise.allSettled([
      client.posts.list.query({ limit: 1 }),
      client.posts.create.mutate("denied"),
    ]);
    expect(results[0]).toEqual({ status: "fulfilled", value: ["http0"] });
    const failure = results[1];
    expect(failure.status).toBe("rejected");
    if (failure.status !== "rejected") throw new Error("Expected the denied mutation to fail.");
    expect(failure.reason).toMatchObject({ code: "FORBIDDEN" });
    token = "second";
    expect(await client.posts.count.query()).toBe(3);
    expect(seen).toEqual(["Bearer first", "Bearer second"]);
  });

  it("is not a thenable and makes no request while inspecting a path", async () => {
    const client = createClient<typeof api>({ links: [] });
    expect(await Promise.resolve(client)).toBe(client);
    await expect(client.posts.count.query()).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});

// Compile-time rejections are checked by tsc; these statements never execute.
function checkProcedureTypes(client: Client<typeof api>): void {
  // @ts-expect-error A client requires a contract produced by c.contract().
  createClient<{ count: typeof api.posts.count }>({});
  // @ts-expect-error A query cannot be called as a mutation.
  void client.posts.list.mutate({ limit: 1 }); // oxlint-disable-line typescript/no-unsafe-call -- Intentionally rejected operation in a negative type test.
  // @ts-expect-error The contract requires a numeric limit.
  void client.posts.list.query({ limit: "1" });
  // @ts-expect-error The required input cannot be omitted.
  void client.posts.list.query();
  // @ts-expect-error The contract has no unknown procedure.
  void client.posts.missing.query(); // oxlint-disable-line typescript/no-unsafe-call, typescript/no-unsafe-member-access -- Intentionally missing procedure in a negative type test.
}
void checkProcedureTypes;

describe("runtime contract metadata", () => {
  it("rejects metadata that lost its contract provenance when copied", () => {
    expect(() => createClient({ contract: { ...api } })).toThrow(
      "Client metadata must come from c.contract().",
    );
  });

  it("rejects a successful GET envelope returned with a failing HTTP status", async () => {
    const contract = c.contract({
      cached: c.query({ input: z.void(), output: z.string(), transport: { method: "GET" } }),
    });
    const client = createClient({
      contract,
      fetch: async () =>
        new Response(JSON.stringify({ id: "get", ok: true, data: "denied" }), { status: 401 }),
    });
    await expect(client.cached.query()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("uses GET for marked queries and POST for other calls, preserving declared GET errors", async () => {
    const contract = c.contract({
      cached: c.query({
        input: z.string(),
        output: z.string(),
        errors: { FORBIDDEN: z.object({ reason: z.string() }) },
        transport: { method: "GET", cache: "public, max-age=60" },
      }),
      write: c.mutation({ input: z.string(), output: z.string() }),
    });
    const runtime = implement(contract)
      .context<Record<never, never>>()
      .procedures({
        cached: ({ input }) => {
          if (input === "denied")
            throw new CableError("FORBIDDEN", { data: { reason: "private" } });
          return input;
        },
        write: ({ input }) => input,
      });
    const handler = createRpcHandler(runtime, { context: () => ({}) });
    const methods: string[] = [];
    const caches: (string | null)[] = [];
    const client = createClient({
      contract,
      fetch: async (url, init) => {
        const address = url instanceof Request ? url.url : url;
        const request = new Request(new URL(address, "https://example.test"), init);
        methods.push(request.method);
        const response = await handler.fetch(request);
        caches.push(response.headers.get("cache-control"));
        return response;
      },
    });
    expect(await client.cached.query("spaces & symbols")).toBe("spaces & symbols");
    await expect(client.cached.query("denied")).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { reason: "private" },
    });
    expect(await client.write.mutate("saved")).toBe("saved");
    expect(methods).toEqual(["GET", "GET", "POST"]);
    expect(caches[0]).toBe("public, max-age=60");
    expect(caches[1]).not.toContain("public");
  });

  it("passes procedure abort signals to HTTP fetches", async () => {
    const contract = c.contract({
      cached: c.query({
        input: z.void(),
        output: z.string(),
        transport: { method: "GET" },
      }),
      write: c.mutation({ input: z.string(), output: z.string() }),
    });
    const runtime = implement(contract)
      .context<Record<never, never>>()
      .procedures({ cached: () => "cached", write: ({ input }) => input });
    const handler = createRpcHandler(runtime, { context: () => ({}) });
    const seen: (AbortSignal | null | undefined)[] = [];
    const client = createClient({
      contract,
      fetch: async (url, init) => {
        seen.push(init?.signal);
        const request = new Request(
          new URL(url instanceof Request ? url.url : url, "https://example.test"),
          {
            ...init,
          },
        );
        return handler.fetch(request);
      },
    });
    const cachedController = new AbortController();
    const writeController = new AbortController();
    await expect(client.cached.query(undefined, { signal: cachedController.signal })).resolves.toBe(
      "cached",
    );
    await expect(client.write.mutate("saved", { signal: writeController.signal })).resolves.toBe(
      "saved",
    );
    expect(seen).toEqual([cachedController.signal, writeController.signal]);
  });

  it("does not start an aborted GET and reports one cancellation", async () => {
    const contract = c.contract({
      cached: c.query({
        input: z.void(),
        output: z.string(),
        transport: { method: "GET" },
      }),
    });
    const controller = new AbortController();
    controller.abort(new Error("before send"));
    let requests = 0;
    const events: string[] = [];
    const client = createClient({
      contract,
      diagnostics: {
        observe: (event) => {
          if (event.type === "operation") events.push(event.outcome);
        },
      },
      fetch: async () => {
        requests += 1;
        return new Response();
      },
    });
    await expect(client.cached.query(undefined, { signal: controller.signal })).rejects.toThrow(
      "before send",
    );
    expect(requests).toBe(0);
    expect(events).toEqual(["cancelled"]);
  });

  it.each(["HTTP", "memory"])("preserves schema transforms over %s", async (transport) => {
    const contract = c.contract({
      convert: c.query({
        input: z.string().transform(Number),
        output: z.number().transform(String),
      }),
    });
    const runtime = implement(contract)
      .context<Record<never, never>>()
      .procedures({
        convert: ({ input }) => {
          expectTypeOf(input).toEqualTypeOf<number>();
          return input + 1;
        },
      });
    const handler = createRpcHandler(runtime, { context: () => ({}) });
    const client = createClient({
      contract,
      url: "https://example.test/_cable",
      fetch: (url, init) => handler.fetch(new Request(url, init)),
      links: transport === "memory" ? [createMemoryLink(runtime, () => ({}))] : [batchLink()],
    });
    expectTypeOf(client.convert.query).returns.toEqualTypeOf<Promise<string>>();
    expect(await client.convert.query("41")).toBe("42");
  });
});

import { c } from "@cablejs/contract";
import { implement } from "@cablejs/core";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { compileOperations, createRestHandler } from "./rest.js";
import { parseJsonValue, type JsonObject, type JsonValue, type SchemaConverter } from "./schema.js";

const policy = { maxBodyBytes: 1_048_576 } as const;
const validationOnlySchema = {
  "~standard": {
    validate: () => ({ value: undefined }),
    vendor: "test",
    version: 1,
  },
} satisfies StandardSchemaV1;
const crossFieldConverter: SchemaConverter = (_schema, mode) =>
  mode === "input"
    ? {
        dependentRequired: { id: ["slug"] },
        properties: { id: { type: "string" }, slug: { type: "string" } },
        type: "object",
      }
    : { type: "string" };

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object";
}

interface StreamingRequestInit extends RequestInit {
  readonly duplex: "half";
}

describe("createRestHandler", () => {
  it("prefers a static route and executes the matching procedure once", async () => {
    const contract = c.contract({
      latest: c.query({
        http: { method: "GET", path: "/posts/latest" },
        input: z.object({}).strict(),
        output: z.string(),
      }),
      read: c.query({
        http: { method: "GET", path: "/posts/{id}" },
        input: z.object({ id: z.string() }).strict(),
        output: z.string(),
      }),
    });
    let latestCalls = 0;
    let readCalls = 0;
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({
        latest: () => {
          latestCalls += 1;
          return "latest";
        },
        read: ({ input }) => {
          readCalls += 1;
          return input.id;
        },
      });
    const mount = createRestHandler(contract, procedures);

    expect(mount.matches(new Request("https://example.test/posts/latest"))).toBe(true);
    const response = await mount.fetch(
      new Request("https://example.test/posts/latest"),
      {},
      policy,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBe("latest");
    expect(latestCalls).toBe(1);
    expect(readCalls).toBe(0);
  });

  it("passes decoded URL input and the incoming signal through one runtime execution", async () => {
    const contract = c.contract({
      read: c.query({
        http: { method: "GET", path: "/posts/{id}" },
        input: z.object({ id: z.string().transform(Number) }).strict(),
        output: z.number(),
      }),
    });
    let observedSignal: AbortSignal | undefined;
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({
        read: ({ input, signal }) => {
          observedSignal = signal;
          return input.id;
        },
      });
    const controller = new AbortController();
    const mount = createRestHandler(contract, procedures);
    const request = new Request("https://example.test/posts/42", { signal: controller.signal });

    const response = await mount.fetch(request, {}, policy);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBe(42);
    expect(observedSignal).toBe(request.signal);
  });

  it("keeps unknown query keys for the procedure schema", async () => {
    const contract = c.contract({
      list: c.query({
        http: { method: "GET", path: "/posts" },
        input: z.looseObject({ page: z.number() }),
        output: z.string(),
      }),
    });
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({ list: ({ input }) => `${input.page}:${String(input["extra"])}` });
    const mount = createRestHandler(contract, procedures);

    const response = await mount.fetch(
      new Request("https://example.test/posts?page=2&extra=yes"),
      {},
      policy,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBe("2:yes");
  });

  it("preserves prototype-named query and body keys for validation", async () => {
    const received: boolean[] = [];
    const input = {
      "~standard": {
        validate(value) {
          const receivedInput = parseJsonValue(value, "test input");
          received.push(
            isRecord(receivedInput) &&
              Object.hasOwn(receivedInput, "__proto__") &&
              Object.getPrototypeOf(receivedInput) === Object.prototype,
          );
          return { value: receivedInput };
        },
        vendor: "test",
        version: 1,
      },
    } satisfies StandardSchemaV1;
    const contract = c.contract({
      create: c.mutation({
        http: { method: "POST", path: "/posts" },
        input,
        output: z.boolean(),
      }),
    });
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({ create: () => true });
    const mount = createRestHandler(contract, procedures, {
      schema: (_schema, mode) =>
        mode === "input"
          ? { additionalProperties: true, properties: {}, type: "object" }
          : { type: "boolean" },
    });

    const query = await mount.fetch(
      jsonRequest("https://example.test/posts?__proto__=query", {}),
      {},
      policy,
    );
    const body = await mount.fetch(
      new Request("https://example.test/posts", {
        body: '{"__proto__":"body","title":"first"}',
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      {},
      policy,
    );

    expect(query.status).toBe(200);
    expect(body.status).toBe(200);
    expect(received).toEqual([true, true]);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it("rejects non-decimal numeric query input", async () => {
    const contract = c.contract({
      list: c.query({
        http: { method: "GET", path: "/posts" },
        input: z.object({ page: z.number() }).strict(),
        output: z.string(),
      }),
    });
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({ list: ({ input }) => String(input.page) });
    const mount = createRestHandler(contract, procedures);

    const empty = await mount.fetch(new Request("https://example.test/posts?page="), {}, policy);
    const hexadecimal = await mount.fetch(
      new Request("https://example.test/posts?page=0x10"),
      {},
      policy,
    );

    expect(empty.status).toBe(400);
    expect(hexadecimal.status).toBe(400);
  });

  it("enforces the edge body byte limit while decoding a multibyte JSON stream", async () => {
    const contract = c.contract({
      create: c.mutation({
        http: { method: "POST", path: "/posts" },
        input: z.object({ title: z.string() }).strict(),
        output: z.string(),
      }),
    });
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({ create: ({ input }) => input.title });
    const mount = createRestHandler(contract, procedures);
    const body = JSON.stringify({ title: "café" });
    const bytes = new TextEncoder().encode(body);
    const stream = new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(bytes.slice(0, 8));
        controller.enqueue(bytes.slice(8));
        controller.close();
      },
    });

    const response = await mount.fetch(
      new Request(
        "https://example.test/posts",
        streamingRequest({
          body: stream,
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      ),
      {},
      { maxBodyBytes: bytes.byteLength - 1 },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
  });

  it("preserves non-GET unknown query keys for passthrough input and rejects ambiguous sources", async () => {
    const contract = c.contract({
      create: c.mutation({
        http: { method: "POST", path: "/posts" },
        input: z.looseObject({ title: z.string() }),
        output: z.string(),
      }),
    });
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({ create: ({ input }) => `${input.title}:${String(input["extra"])}` });
    const mount = createRestHandler(contract, procedures);

    const preserved = await mount.fetch(
      jsonRequest("https://example.test/posts?extra=query", { title: "first" }),
      {},
      policy,
    );
    const knownInQuery = await mount.fetch(
      jsonRequest("https://example.test/posts?title=query", { title: "first" }),
      {},
      policy,
    );
    const collision = await mount.fetch(
      jsonRequest("https://example.test/posts?extra=query", { extra: "body", title: "first" }),
      {},
      policy,
    );

    await expect(preserved.json()).resolves.toBe("first:query");
    expect(knownInQuery.status).toBe(400);
    expect(collision.status).toBe(400);
  });

  it("lets strict schema validation reject preserved unknown mutation input", async () => {
    const contract = c.contract({
      create: c.mutation({
        http: { method: "POST", path: "/posts" },
        input: z.object({ title: z.string() }).strict(),
        output: z.string(),
      }),
    });
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({ create: ({ input }) => input.title });
    const response = await createRestHandler(contract, procedures).fetch(
      jsonRequest("https://example.test/posts?extra=query", { title: "first" }),
      {},
      policy,
    );

    expect(response.status).toBe(400);
  });

  it("accepts scalar mutation input only from a JSON body", async () => {
    const contract = c.contract({
      echo: c.mutation({
        http: { method: "POST", path: "/echo" },
        input: z.string(),
        output: z.string(),
      }),
    });
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({ echo: ({ input }) => input });
    const mount = createRestHandler(contract, procedures);

    const response = await mount.fetch(
      jsonRequest("https://example.test/echo", "hello"),
      {},
      policy,
    );
    const query = await mount.fetch(
      jsonRequest("https://example.test/echo?value=hello", "hello"),
      {},
      policy,
    );

    await expect(response.json()).resolves.toBe("hello");
    expect(query.status).toBe(400);
  });

  it("accepts a path-only mutation without a JSON body", async () => {
    const contract = c.contract({
      remove: c.mutation({
        http: { method: "DELETE", path: "/posts/{id}" },
        input: z.object({ id: z.string() }).strict(),
        output: z.string(),
      }),
    });
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({ remove: ({ input }) => input.id });

    const response = await createRestHandler(contract, procedures).fetch(
      new Request("https://example.test/posts/first", { method: "DELETE" }),
      {},
      policy,
    );

    await expect(response.json()).resolves.toBe("first");
  });

  it("keeps the most specific path REST-owned when its method is unavailable", async () => {
    const contract = c.contract({
      user: c.query({
        http: { method: "GET", path: "/users/{id}" },
        input: z.object({ id: z.string() }).strict(),
        output: z.string(),
      }),
      self: c.mutation({
        http: { method: "POST", path: "/users/me" },
        input: z.object({}).strict(),
        output: z.string(),
      }),
    });
    let calls = 0;
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({
        self: () => {
          calls += 1;
          return "self";
        },
        user: () => {
          calls += 1;
          return "user";
        },
      });
    const response = await createRestHandler(contract, procedures).fetch(
      new Request("https://example.test/users/me"),
      {},
      policy,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(calls).toBe(0);
  });

  it("rejects unsupported GET query shapes and repeated route placeholders at registration", () => {
    const nested = c.contract({
      list: c.query({
        http: { method: "GET", path: "/posts" },
        input: z.object({ filter: z.object({ author: z.string() }) }).strict(),
        output: z.string(),
      }),
    });
    const repeated = c.contract({
      read: c.query({
        http: { method: "GET", path: "/pairs/{id}/{id}" },
        input: z.object({ id: z.string() }).strict(),
        output: z.string(),
      }),
    });
    const nestedProcedures = implement(nested)
      .context<Record<never, never>>()
      .procedures({ list: () => "" });
    const repeatedProcedures = implement(repeated)
      .context<Record<never, never>>()
      .procedures({ read: () => "" });

    expect(() => createRestHandler(nested, nestedProcedures)).toThrow(
      "unsupported query parameter shape",
    );
    expect(() => createRestHandler(repeated, repeatedProcedures)).toThrow("repeats placeholder");
  });

  it("rejects non-scalar mutation path parameters at registration", () => {
    const contract = c.contract({
      remove: c.mutation({
        http: { method: "DELETE", path: "/posts/{id}" },
        input: z.object({ id: z.object({ value: z.string() }) }).strict(),
        output: z.string(),
      }),
    });
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({ remove: () => "" });

    expect(() => createRestHandler(contract, procedures)).toThrow("HTTP path parameter");
  });

  it("rejects constraints that cannot survive projected path or query bindings", () => {
    const contract = c.contract({
      read: c.query({
        http: { method: "GET", path: "/posts/{id}" },
        input: validationOnlySchema,
        output: validationOnlySchema,
      }),
    });
    expect(() => compileOperations(contract, crossFieldConverter)).toThrow(
      "unsupported cross-field constraints",
    );
  });

  it("rejects equivalent parameterized route templates", () => {
    const contract = c.contract({
      byId: c.query({
        http: { method: "GET", path: "/users/{id}" },
        input: z.object({ id: z.string() }).strict(),
        output: z.string(),
      }),
      bySlug: c.query({
        http: { method: "GET", path: "/users/{slug}" },
        input: z.object({ slug: z.string() }).strict(),
        output: z.string(),
      }),
    });
    const procedures = implement(contract)
      .context<Record<never, never>>()
      .procedures({ byId: ({ input }) => input.id, bySlug: ({ input }) => input.slug });

    expect(() => createRestHandler(contract, procedures)).toThrow("Conflicting HTTP route");
  });
});

function streamingRequest(init: Omit<StreamingRequestInit, "duplex">): StreamingRequestInit {
  return { ...init, duplex: "half" };
}

function jsonRequest(url: string, body: JsonValue): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

import { c } from "@cablejs/contract";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createOpenApiDocument } from "./openapi.js";

describe("createOpenApiDocument", () => {
  it("documents GET parameters, output, built-in errors, declared errors, and security", () => {
    const contract = c.contract({
      read: c.query({
        errors: { DENIED: z.object({ reason: z.string() }) },
        http: {
          method: "GET",
          operationId: "readPost",
          path: "/posts/{postId}",
          security: [{ bearerAuth: [] }],
          successStatus: 202,
          summary: "Read a post",
          tags: ["posts"],
        },
        input: z.looseObject({ page: z.number().optional(), postId: z.string() }),
        output: z.object({ title: z.string() }),
      }),
    });

    const document = createOpenApiDocument(contract, {
      info: { title: "Posts", version: "1.0.0" },
      securitySchemes: { bearerAuth: { scheme: "bearer", type: "http" } },
    });
    const operation = document.paths["/posts/{postId}"]?.get;

    expect(document.openapi).toBe("3.1.2");
    expect(operation).toMatchObject({
      operationId: "readPost",
      security: [{ bearerAuth: [] }],
      summary: "Read a post",
      tags: ["posts"],
    });
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: "path", name: "postId", required: true }),
        expect.objectContaining({ in: "query", name: "page" }),
      ]),
    );
    expect(operation?.responses["202"]).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/read-output" } } },
    });
    expect(document.components?.schemas?.["read-output"]).toMatchObject({
      properties: { title: { type: "string" } },
    });
    expect(operation?.responses["400"]).toMatchObject({
      content: { "application/json": { schema: { properties: { error: { type: "object" } } } } },
    });
    expect(operation?.responses["default"]).toBeDefined();
  });

  it("removes path fields from JSON bodies without changing the remaining input schema", () => {
    const contract = c.contract({
      update: c.mutation({
        http: { method: "PATCH", path: "/posts/{postId}" },
        input: z.looseObject({ postId: z.string(), title: z.string() }),
        output: z.object({ title: z.string() }),
      }),
    });

    const document = createOpenApiDocument(contract, {
      info: { title: "Posts", version: "1.0.0" },
    });
    const body = document.paths["/posts/{postId}"]?.patch?.requestBody;

    expect(body).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/update-input" },
        },
      },
      required: true,
    });
    expect(document.components?.schemas?.["update-input"]).toMatchObject({
      properties: { title: { type: "string" } },
      required: ["title"],
    });
  });

  it("marks an all-optional object body optional", () => {
    const contract = c.contract({
      list: c.mutation({
        http: { method: "POST", path: "/posts" },
        input: z.object({ page: z.number().optional() }),
        output: z.string(),
      }),
    });

    const document = createOpenApiDocument(contract, {
      info: { title: "Posts", version: "1.0.0" },
    });

    expect(document.paths["/posts"]?.post?.requestBody?.required).toBe(false);
  });

  it("rejects security requirements that name no supplied security scheme", () => {
    const contract = c.contract({
      read: c.query({
        http: { method: "GET", path: "/posts", security: [{ bearerAuth: [] }] },
        input: z.object({}),
        output: z.string(),
      }),
    });

    expect(() =>
      createOpenApiDocument(contract, { info: { title: "Posts", version: "1.0.0" } }),
    ).toThrow("bearerAuth");
  });

  it("rebases document-local recursive references into a response component", () => {
    const recursive: z.ZodType<{ child?: unknown }> = z.object({
      child: z.lazy(() => recursive).optional(),
    });
    const contract = c.contract({
      read: c.query({
        http: { method: "GET", path: "/posts" },
        input: z.object({}),
        output: recursive,
      }),
    });

    const document = createOpenApiDocument(contract, {
      info: { title: "Posts", version: "1.0.0" },
    });
    const response = document.paths["/posts"]?.get?.responses["200"];

    expect(response?.content["application/json"]?.schema).toEqual({
      $ref: "#/components/schemas/read-output",
    });
    expect(document.components?.schemas?.["read-output"]).toMatchObject({
      properties: { child: { $ref: "#/components/schemas/read-output" } },
    });
  });

  it("keeps components distinct when procedure paths would collide after punctuation normalization", () => {
    const contract = c.contract({
      "a-b": {
        c: c.query({
          http: { method: "GET", path: "/one" },
          input: z.object({}),
          output: z.literal("one"),
        }),
      },
      a: {
        "b-c": c.query({
          http: { method: "GET", path: "/two" },
          input: z.object({}),
          output: z.literal("two"),
        }),
      },
    });
    const document = createOpenApiDocument(contract, { info: { title: "Names", version: "1" } });

    const one =
      document.paths["/one"]?.get?.responses["200"]?.content["application/json"]?.schema["$ref"];
    const two =
      document.paths["/two"]?.get?.responses["200"]?.content["application/json"]?.schema["$ref"];
    expect(one).not.toBe(two);
    expect(one).toBe("#/components/schemas/a-b_2e_c-output");
    expect(two).toBe("#/components/schemas/a_2e_b-c-output");
  });
});

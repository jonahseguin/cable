import { c } from "@cable/contract";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CableError } from "./errors.js";
import { implement, type ProcedureErrorContext } from "./implementation.js";
import { createRpcHandler, decodeBatchResponse, encodeBatch } from "./rpc.js";

const testContract = c.contract({
  explode: c.mutation({ input: z.void(), output: z.void() }),
  invalidOutput: c.query({ input: z.void(), output: z.string().min(3) }),
  unsupportedOutput: c.query({ input: z.void(), output: z.date() }),
  nested: {
    convert: c.query({
      input: z.string().transform((value) => Number(value)),
      output: z.number().transform((value) => `#${value}`),
      transport: { cache: "public, max-age=10", method: "GET" },
    }),
    declaredFailure: c.mutation({
      errors: { NOT_READY: z.object({ wait: z.number().int().positive() }) },
      input: z.number(),
      output: z.string(),
    }),
  },
});

interface InitialContext {
  readonly tenant: string;
}

function createTestProcedures(
  onError?: (error: ProcedureErrorContext<InitialContext>["error"]) => void,
) {
  return implement(testContract)
    .context<InitialContext>()
    .use(async ({ ctx, next }) => next({ ctx: { ...ctx, requestTag: `${ctx.tenant}:request` } }))
    .procedures(
      {
        explode: () => {
          throw new Error("database password leaked here");
        },
        invalidOutput: () => "x",
        unsupportedOutput: () => new Date(0),
        nested: {
          convert: ({ ctx, input }) => {
            expect(ctx.requestTag).toBe("acme:request");
            return input + 1;
          },
          declaredFailure: ({ input }) => {
            throw new CableError("NOT_READY", {
              data: { wait: input },
              message: "Not ready",
              status: 409,
            });
          },
        },
      },
      {
        onError: ({ error }) => {
          onError?.(error);
        },
      },
    );
}

describe("implement", () => {
  it("parses transformed input, threads middleware context, and parses output", async () => {
    const procedures = createTestProcedures();
    const result = await procedures.execute(
      { id: "one", input: "41", path: "nested.convert" },
      { tenant: "acme" },
    );

    expect(result).toEqual({ data: "#42", id: "one", ok: true });
    expect(procedures.transport("nested.convert")).toEqual({
      cache: "public, max-age=10",
      method: "GET",
    });
  });

  it("provides a typed caller over the same validation path", async () => {
    const caller = createTestProcedures().caller({ tenant: "acme" });

    await expect(caller.nested.convert("9")).resolves.toBe("#10");
    await expect(caller.explode()).rejects.toMatchObject({
      code: "INTERNAL",
      message: "Internal server error",
      status: 500,
    });
  });

  it("validates declared error data before exposing it", async () => {
    const result = await createTestProcedures().execute(
      { id: "two", input: 3, path: "nested.declaredFailure" },
      { tenant: "acme" },
    );

    expect(result).toEqual({
      error: {
        code: "NOT_READY",
        data: { wait: 3 },
        message: "Not ready",
        status: 409,
      },
      id: "two",
      ok: false,
    });
  });

  it("sanitizes unknown handler failures and reports the original", async () => {
    const observed: unknown[] = [];
    const result = await createTestProcedures((error) => observed.push(error)).execute(
      { id: "three", input: undefined, path: "explode" },
      { tenant: "acme" },
    );

    expect(result).toEqual({
      error: { code: "INTERNAL", message: "Internal server error", status: 500 },
      id: "three",
      ok: false,
    });
    expect(observed).toHaveLength(1);
    expect(observed[0]).toBeInstanceOf(Error);
  });

  it("treats invalid handler output as an internal server failure", async () => {
    const result = await createTestProcedures().execute(
      { id: "four", input: undefined, path: "invalidOutput" },
      { tenant: "acme" },
    );

    expect(result).toEqual({
      error: { code: "INTERNAL", message: "Internal server error", status: 500 },
      id: "four",
      ok: false,
    });
  });

  it("rejects non-JSON input before schema validation", async () => {
    const result = await createTestProcedures().execute(
      { id: "json-input", input: new Date(0), path: "nested.convert" },
      { tenant: "acme" },
    );

    expect(result).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "RPC data must use plain objects and arrays",
        status: 400,
      },
      id: "json-input",
      ok: false,
    });
  });

  it("rejects input before running middleware or handlers", async () => {
    const result = await createTestProcedures().execute(
      { id: "five", input: null, path: "nested.convert" },
      { tenant: "acme" },
    );

    expect(result).toMatchObject({
      error: { code: "VALIDATION", status: 400 },
      id: "five",
      ok: false,
    });
  });

  it("returns NOT_FOUND for paths outside the implementation", async () => {
    await expect(
      createTestProcedures().execute(
        { id: "six", input: undefined, path: "missing" },
        { tenant: "acme" },
      ),
    ).resolves.toEqual({
      error: { code: "NOT_FOUND", message: "Procedure not found", status: 404 },
      id: "six",
      ok: false,
    });
  });

  it("prevents middleware from invoking a handler more than once", async () => {
    let calls = 0;
    const once = c.contract({ mutation: c.mutation({ input: z.void(), output: z.number() }) });
    const builder = implement(once).context<object>();
    const repeated = builder.procedure.use(async ({ ctx, next }) => {
      await next({ ctx });
      return next({ ctx });
    });
    const procedures = builder.procedures({
      mutation: repeated(once.mutation, () => {
        calls += 1;
        return calls;
      }),
    });

    await expect(
      procedures.execute({ id: "once", input: undefined, path: "mutation" }, {}),
    ).resolves.toEqual({
      error: { code: "INTERNAL", message: "Internal server error", status: 500 },
      id: "once",
      ok: false,
    });
    expect(calls).toBe(1);
  });

  it("runs a resolved leaf's captured middleware once", async () => {
    const order: string[] = [];
    const builder = implement(testContract).context<InitialContext>();
    const protectedProcedure = builder.procedure.use(async ({ ctx, next }) => {
      order.push("protected");
      return next({ ctx: { ...ctx, requestTag: "resolved" } });
    });
    const procedures = builder.procedures({
      explode: () => undefined,
      invalidOutput: () => "valid",
      unsupportedOutput: () => new Date(0),
      nested: {
        convert: protectedProcedure(testContract.nested.convert, ({ ctx, input }) => {
          order.push(ctx.requestTag);
          return input + 1;
        }),
        declaredFailure: () => "ready",
      },
    });
    await expect(
      procedures.execute({ id: "resolved", input: "1", path: "nested.convert" }, { tenant: "a" }),
    ).resolves.toEqual({ data: "#2", id: "resolved", ok: true });
    expect(order).toEqual(["protected", "resolved"]);
  });

  it("rejects a resolved handler mounted at a different same-shaped contract leaf", () => {
    const twin = c.contract({
      first: c.query({ input: z.void(), output: z.string() }),
      second: c.query({ input: z.void(), output: z.string() }),
    });
    const builder = implement(twin).context<{}>();
    const first = builder.procedure(twin.first, () => "first");
    expect(() => builder.procedures({ first, second: first })).toThrow(
      "Procedure resolver contract does not match second",
    );
  });

  it("keeps successful calls in a mixed HTTP batch independent", async () => {
    const handler = createRpcHandler(createTestProcedures(), {
      context: () => ({ tenant: "acme" }),
    });
    const response = await handler.fetch(
      new Request("https://example.test/_cable/rpc", {
        body: encodeBatch({
          calls: [
            { id: "first", input: "1", path: "nested.convert" },
            { id: "second", input: undefined, path: "unsupportedOutput" },
            { id: "third", input: "4", path: "nested.convert" },
          ],
        }),
        method: "POST",
      }),
    );

    expect(decodeBatchResponse(await response.text())).toEqual({
      results: [
        { data: "#2", id: "first", ok: true },
        {
          error: { code: "INTERNAL", message: "Internal server error", status: 500 },
          id: "second",
          ok: false,
        },
        { data: "#5", id: "third", ok: true },
      ],
    });
  });
});

import { createMemoryLink } from "@cable/adapter-memory";
import { createClient } from "@cable/client";
import { c } from "@cable/contract";
import { CableError, implement } from "@cable/core";
import { QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { createCableQuery } from "./query-options.js";

const api = c.contract({
  posts: {
    count: c.query({ input: z.void(), output: z.number() }),
    list: c.query({ input: z.object({ limit: z.number().int() }), output: z.array(z.string()) }),
    create: c.mutation({
      input: z.string(),
      output: z.string(),
      errors: { FORBIDDEN: z.object({ reason: z.string() }) },
    }),
  },
});

function queryClient() {
  const procedures = implement(api)
    .context<Record<never, never>>()
    .procedures({
      posts: {
        count: () => 2,
        create: ({ input }) => {
          if (input === "denied")
            throw new CableError("FORBIDDEN", { data: { reason: "private" } });
          return input;
        },
        list: ({ input }) => Array.from({ length: input.limit }, (_, index) => String(index)),
      },
    });
  return createCableQuery(
    createClient<typeof api>({ links: [createMemoryLink(procedures, () => ({}))] }),
  );
}

describe("createCableQuery", () => {
  it("creates stable structured keys and native query options", async () => {
    const cable = queryClient();
    const options = cable.posts.list.queryOptions({ limit: 2 });
    expect(cable.posts.list).toBe(cable.posts.list);
    expect(options.queryKey).toEqual(["cable", "posts.list", { limit: 2 }]);
    expect(await new QueryClient().query(options)).toEqual(["0", "1"]);
  });

  it("creates mutation options that preserve the client procedure error", async () => {
    const cable = queryClient();
    const options = cable.posts.create.mutationOptions();
    const client = new QueryClient();
    expect(await client.getMutationCache().build(client, options).execute("saved")).toBe("saved");
    await expect(
      client.getMutationCache().build(client, options).execute("denied"),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { reason: "private" },
    });
  });
});

function typeAssertions() {
  const cable = queryClient();
  const query = cable.posts.list.queryOptions({ limit: 1 });
  const mutation = cable.posts.create.mutationOptions();
  expectTypeOf(query.queryKey[0]).toEqualTypeOf<"cable">();
  expectTypeOf(query.queryKey[1]).toEqualTypeOf<string>();
  expectTypeOf(query.queryKey[2]).toEqualTypeOf<{ limit: number }>();
  expectTypeOf(mutation.mutationFn).parameter(0).toEqualTypeOf<string>();
  expectTypeOf(useQuery(query).data).toEqualTypeOf<string[] | undefined>();
  expectTypeOf(useMutation(mutation).error?.code).toEqualTypeOf<
    | "FORBIDDEN"
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "NOT_FOUND"
    | "TIMEOUT"
    | "CONFLICT"
    | "PAYLOAD_TOO_LARGE"
    | "TOO_MANY_REQUESTS"
    | "INTERNAL"
    | "UNAVAILABLE"
    | "PARSE_ERROR"
    | "VALIDATION"
    | undefined
  >();
}
void typeAssertions;

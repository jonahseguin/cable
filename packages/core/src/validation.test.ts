import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CableError } from "./errors.js";
import { validate } from "./validation.js";

describe("validate", () => {
  it("returns the parsed output of an asynchronous Standard Schema", async () => {
    const schema = z.string().transform(async (value) => Number(value));

    await expect(validate(schema, "42")).resolves.toBe(42);
  });

  it("returns bounded issue details in a typed Cable error", async () => {
    const result = validate(z.object({ id: z.uuid() }), { id: "bad" });

    await expect(result).rejects.toBeInstanceOf(CableError);
    await expect(result).rejects.toMatchObject({
      code: "VALIDATION",
      data: { issues: [{ message: "Invalid UUID" }] },
      status: 400,
    });
  });
});

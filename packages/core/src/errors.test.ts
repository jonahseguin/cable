import { describe, expect, expectTypeOf, it } from "vitest";

import { CableError, isCableError, statusForCode } from "./errors.js";

describe("CableError", () => {
  it("assigns stable status codes and keeps declared data", () => {
    const error = new CableError("RATE_LIMITED", {
      data: { retryAfter: 30 },
      message: "Try later",
      status: 429,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      code: "RATE_LIMITED",
      data: { retryAfter: 30 },
      message: "Try later",
      name: "CableError",
      status: 429,
    });
    expect(statusForCode("NOT_FOUND")).toBe(404);
    expect(statusForCode("APPLICATION_CODE")).toBe(400);
    expect(() => new CableError("BROKEN", { status: 200 })).toThrow(RangeError);
  });

  it("narrows untrusted failures by code", () => {
    const candidate = new CableError("CONFLICT", {
      data: { revision: 4 },
    });

    expect(isCableError(candidate, "CONFLICT")).toBe(true);
    const narrowed = isCableError(candidate, "CONFLICT") ? candidate : undefined;
    expectTypeOf(narrowed?.code).toEqualTypeOf<"CONFLICT" | undefined>();
    expect(narrowed?.data).toEqual({ revision: 4 });
    expect(isCableError(new Error("no"))).toBe(false);
  });
});

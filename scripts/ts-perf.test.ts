import { expect, it } from "vitest";

import { parseDiagnostics, withinBudget } from "./ts-perf.js";

it("reads compiler diagnostics and rejects missing measurements", () => {
  expect(parseDiagnostics("Instantiations:  12345\nCheck time:  0.32s\n")).toEqual({
    instantiations: 12345,
    checkSeconds: 0.32,
  });
  expect(() => parseDiagnostics("Instantiations: 100\n")).toThrow(
    "tsc did not report both Instantiations and Check time.",
  );
});

it("enforces strict limits on both instantiations and elapsed check time", () => {
  expect(withinBudget({ instantiations: 499_999, checkSeconds: 2.49 })).toBe(true);
  expect(withinBudget({ instantiations: 500_000, checkSeconds: 0.1 })).toBe(false);
  expect(withinBudget({ instantiations: 1, checkSeconds: 2.5 })).toBe(false);
});

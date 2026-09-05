import { expect, it } from "vitest";

import { clientProgramLeaks, parseDiagnostics, withinBudget } from "./ts-perf.js";

it("rejects implementation source in the client type program", () => {
  const root = "/workspace/cable";
  expect(
    clientProgramLeaks(
      [
        "/workspace/cable/fixtures/big-contract/client.ts",
        "/workspace/cable/fixtures/big-contract/backend.ts",
        "/workspace/cable/packages/core/src/implement.ts",
      ].join("\n"),
      root,
    ),
  ).toEqual([
    "/workspace/cable/fixtures/big-contract/backend.ts",
    "/workspace/cable/packages/core/src/",
  ]);
  expect(
    clientProgramLeaks(
      [
        "/workspace/cable/fixtures/big-contract/client.ts",
        "/workspace/cable/packages/core/dist/index.d.mts",
      ].join("\n"),
      root,
    ),
  ).toEqual([]);
});

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

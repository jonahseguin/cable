import { describe, expect, it } from "vitest";

import { observeDiagnostic, type CableDiagnosticEvent } from "./diagnostics.js";

const event: CableDiagnosticEvent = {
  durationMs: 12,
  name: "posts.create",
  outcome: "ok",
  runtime: "client",
  startedAt: 1_700_000_000_000,
  transport: "rpc",
  type: "operation",
};

describe("observeDiagnostic", () => {
  it("contains thrown and rejected observer failures", async () => {
    expect(() => {
      observeDiagnostic(
        {
          observe: async () => {
            throw new Error("exporter unavailable");
          },
        },
        event,
      );
    }).not.toThrow();

    await Promise.resolve();
  });
});

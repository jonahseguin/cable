import { expect, it } from "vitest";

import { startSession, stopSession, type GateEnvironment } from "./agent-quality-gate.js";

function environment(initial = "base") {
  let fingerprint = initial;
  let state: Parameters<GateEnvironment["writeState"]>[2] | undefined;
  let checks = 0;
  let passes = true;
  const value: GateEnvironment = {
    fingerprint: () => fingerprint,
    readState: () => state,
    runCheck: () => {
      checks += 1;
      return passes;
    },
    writeState: (_root, _session, next) => {
      state = next;
    },
  };
  return {
    checks: () => checks,
    setFingerprint: (next: string) => {
      fingerprint = next;
    },
    setPasses: (next: boolean) => {
      passes = next;
    },
    value,
  };
}

const input = { session_id: "session" };

it("blocks an unchanged failed gate once, then leaves an honest blocker path", () => {
  const test = environment();
  startSession(input, test.value, "/repo");
  test.setFingerprint("changed");
  test.setPasses(false);

  expect(stopSession(input, test.value, "/repo").decision).toBe("block");
  expect(
    stopSession({ ...input, stop_hook_active: true }, test.value, "/repo").systemMessage,
  ).toContain("did not verify");
  expect(test.checks()).toBe(1);
});

it("caches only a successful check for the exact changed content", () => {
  const test = environment();
  startSession(input, test.value, "/repo");
  test.setFingerprint("changed");

  expect(stopSession(input, test.value, "/repo")).toEqual({});
  expect(stopSession(input, test.value, "/repo")).toEqual({});
  expect(test.checks()).toBe(1);
});

it("skips read-only sessions and invalidates success when content changes", () => {
  const test = environment();
  startSession(input, test.value, "/repo");

  expect(stopSession(input, test.value, "/repo")).toEqual({});
  test.setFingerprint("first change");
  expect(stopSession(input, test.value, "/repo")).toEqual({});
  test.setFingerprint("second change");
  expect(stopSession(input, test.value, "/repo")).toEqual({});
  expect(test.checks()).toBe(2);
});

it("does not cache a check when repository content changes during it", () => {
  let fingerprint = "base";
  let state: Parameters<GateEnvironment["writeState"]>[2] | undefined;
  const test: GateEnvironment = {
    fingerprint: () => fingerprint,
    readState: () => state,
    runCheck: () => {
      fingerprint = "changed during check";
      return true;
    },
    writeState: (_root, _session, next) => {
      state = next;
    },
  };
  startSession(input, test, "/repo");
  fingerprint = "changed before check";

  expect(stopSession(input, test, "/repo").decision).toBe("block");
  expect(stopSession({ ...input, stop_hook_active: true }, test, "/repo").systemMessage).toContain(
    "did not verify",
  );
});

it("blocks a session that moves to another worktree instead of losing its starting state", () => {
  const fingerprints = new Map([
    ["/a", "base"],
    ["/b", "base"],
  ]);
  let state: Parameters<GateEnvironment["writeState"]>[2] | undefined;
  const checked: string[] = [];
  const test: GateEnvironment = {
    fingerprint: (root) => fingerprints.get(root) ?? "missing",
    readState: () => state,
    runCheck: (root) => {
      checked.push(root);
      return true;
    },
    writeState: (_root, _session, next) => {
      state = next;
    },
  };
  startSession(input, test, "/a");
  fingerprints.set("/a", "changed");

  expect(stopSession(input, test, "/b").decision).toBe("block");
  expect(stopSession({ ...input, stop_hook_active: true }, test, "/b").systemMessage).toContain(
    "did not verify",
  );
  expect(checked).toEqual([]);
});

it("runs the gate when Stop has no SessionStart record", () => {
  const test = environment("changed");

  expect(stopSession(input, test.value, "/repo")).toEqual({});
  expect(test.checks()).toBe(1);
});

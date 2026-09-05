import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import baseline from "../fixtures/big-contract/baseline.json" with { type: "json" };

/** Measurements reported by a fresh TypeScript compiler run. */
export interface Diagnostics {
  instantiations: number;
  checkSeconds: number;
}

/** Return client-program files that cross into implementation-only source. */
export function clientProgramLeaks(output: string, root: string): string[] {
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/u, "");
  const forbidden = [
    `${normalizedRoot}/fixtures/big-contract/backend.ts`,
    `${normalizedRoot}/packages/core/src/`,
    `${normalizedRoot}/packages/adapter-memory/src/`,
  ];
  const files = output
    .split(/\r?\n/u)
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => file.length > 0);
  return forbidden.filter((path) => files.some((file) => file === path || file.startsWith(path)));
}

/** Parse tsc's own diagnostics, rejecting incomplete or unexpected compiler output. */
export function parseDiagnostics(output: string): Diagnostics {
  const instantiations = /^Instantiations:\s+(\d+)\s*$/mu.exec(output)?.[1];
  const checkSeconds = /^Check time:\s+([\d.]+)s\s*$/mu.exec(output)?.[1];
  if (instantiations === undefined || checkSeconds === undefined) {
    throw new Error("tsc did not report both Instantiations and Check time.");
  }
  const result = { instantiations: Number(instantiations), checkSeconds: Number(checkSeconds) };
  if (!Number.isFinite(result.instantiations) || !Number.isFinite(result.checkSeconds)) {
    throw new Error("tsc reported invalid performance measurements.");
  }
  return result;
}

/** The design budgets are strict upper bounds, not inclusive limits. */
export function withinBudget(diagnostics: Diagnostics): boolean {
  return diagnostics.instantiations < 500_000 && diagnostics.checkSeconds < 2.5;
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (baseline.status === "scaffold") {
    console.log(
      "TS performance: NOT BASELINED. M1 must exercise the real contract/client APIs (200 procedures, 40 channels).",
    );
    if (process.argv.includes("--require-baseline")) process.exitCode = 1;
    return;
  }
  if (baseline.status !== "active") throw new Error("Unknown performance baseline status.");
  const fileList = spawnSync(
    "bun",
    [
      "x",
      "--no-install",
      "tsc",
      "--noEmit",
      "--incremental",
      "false",
      "--listFilesOnly",
      "-p",
      "fixtures/big-contract/tsconfig.json",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (fileList.error) throw fileList.error;
  if (fileList.status !== 0) {
    process.stdout.write(fileList.stdout);
    process.stderr.write(fileList.stderr);
    process.exitCode = fileList.status ?? 1;
    return;
  }
  const leaks = clientProgramLeaks(fileList.stdout, root);
  if (leaks.length > 0) {
    console.error(`Client type program includes implementation-only files:\n${leaks.join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log("Client type program excludes backend, core source, and memory-adapter source.");
  const result = spawnSync(
    "bun",
    [
      "x",
      "--no-install",
      "tsc",
      "--noEmit",
      "--incremental",
      "false",
      "--extendedDiagnostics",
      "-p",
      "fixtures/big-contract/tsconfig.json",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }
  if (!withinBudget(parseDiagnostics(result.stdout))) {
    console.error(
      "TypeScript performance budget exceeded: require <500k instantiations and <2.5s check time.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();

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

/** The program budgets are strict upper bounds, not inclusive limits. */
export function withinBudget(diagnostics: Diagnostics, checkSecondsBelow: number): boolean {
  return diagnostics.instantiations < 500_000 && diagnostics.checkSeconds < checkSecondsBelow;
}

interface PerformanceProgram {
  readonly name: string;
  readonly project: string;
  readonly checkSecondsBelow: number;
}

const programs: readonly PerformanceProgram[] = [
  { name: "client", project: "fixtures/big-contract/tsconfig.json", checkSecondsBelow: 3 },
  { name: "edge", project: "fixtures/big-contract/edge.tsconfig.json", checkSecondsBelow: 2.5 },
];

function runCompiler(root: string, project: string, extendedDiagnostics: boolean) {
  return spawnSync(
    "bun",
    [
      "x",
      "--no-install",
      "tsc",
      "--noEmit",
      "--incremental",
      "false",
      ...(extendedDiagnostics ? ["--extendedDiagnostics"] : ["--listFilesOnly"]),
      "-p",
      project,
    ],
    { cwd: root, encoding: "utf8" },
  );
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (!hasActiveBaseline() || !checkClientBoundary(root)) return;
  for (const program of programs) {
    if (!measureProgram(root, program)) return;
  }
}

function hasActiveBaseline(): boolean {
  if (baseline.status === "active") return true;
  if (baseline.status !== "scaffold") throw new Error("Unknown performance baseline status.");
  console.log(
    "TS performance: NOT BASELINED. M1 must exercise the real contract/client APIs (200 procedures, 40 channels).",
  );
  if (process.argv.includes("--require-baseline")) process.exitCode = 1;
  return false;
}

function checkClientBoundary(root: string): boolean {
  const client = programs[0];
  if (client === undefined) throw new Error("Client performance program is required");
  const fileList = runCompiler(root, client.project, false);
  if (fileList.error) throw fileList.error;
  if (fileList.status !== 0) {
    process.stdout.write(fileList.stdout);
    process.stderr.write(fileList.stderr);
    process.exitCode = fileList.status ?? 1;
    return false;
  }
  const leaks = clientProgramLeaks(fileList.stdout, root);
  if (leaks.length > 0) {
    console.error(`Client type program includes implementation-only files:\n${leaks.join("\n")}`);
    process.exitCode = 1;
    return false;
  }
  console.log("Client type program excludes backend, core source, and memory-adapter source.");
  return true;
}

function measureProgram(root: string, program: PerformanceProgram): boolean {
  const result = runCompiler(root, program.project, true);
  if (result.error) throw result.error;
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return false;
  }
  const diagnostics = parseDiagnostics(result.stdout);
  console.log(
    `${program.name} type performance: ${diagnostics.instantiations} instantiations, ${diagnostics.checkSeconds}s check time.`,
  );
  if (withinBudget(diagnostics, program.checkSecondsBelow)) return true;
  console.error(
    `${program.name} type performance budget exceeded: require <500k instantiations and <${program.checkSecondsBelow}s check time.`,
  );
  process.exitCode = 1;
  return false;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();

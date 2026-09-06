import { spawn } from "node:child_process";

import { exitCode } from "./process-lifecycle.ts";

const secret = process.env["CABLE_GRANT_SECRET"];
if (secret === undefined) throw new Error("CABLE_GRANT_SECRET is required.");

const cwd = new URL("..", import.meta.url);
const build = spawn("bun", ["build", "src/node.ts", "--target=node", "--outdir=dist/node"], {
  cwd,
  stdio: "inherit",
});
const buildCode = await exitCode(build);
if (buildCode !== 0) process.exitCode = buildCode ?? 1;
else {
  const children = [
    spawn("node", ["dist/node/node.js"], {
      cwd,
      env: { ...process.env, CABLE_GRANT_SECRET: secret },
      stdio: "inherit",
    }),
    spawn("bunx", ["vite", "--mode", "node"], {
      cwd,
      env: process.env,
      stdio: "inherit",
    }),
  ];

  let stopping = false;
  async function stop(code: number): Promise<void> {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill("SIGTERM");
    await Promise.all(children.map(exitCode));
    process.exitCode = code;
  }
  process.once("SIGINT", () => void stop(0));
  process.once("SIGTERM", () => void stop(0));
  for (const child of children) child.once("exit", (code) => void stop(code ?? 1));
}

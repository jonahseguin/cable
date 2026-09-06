import { spawn } from "node:child_process";

import { waitFor } from "./chat-await.ts";
import { verifyChat } from "./chat-smoke.ts";
import { captureOutput, exitCode, stopChild } from "./process-lifecycle.ts";

const port = 8_789;
const endpoint = `http://127.0.0.1:${port}/_cable`;
const secret = "local-integration-secret-with-at-least-32-bytes";
const cwd = new URL("..", import.meta.url);
await buildNodeEntry();
const worker = spawn("node", ["dist/node/node.js"], {
  cwd,
  env: { ...process.env, CABLE_GRANT_SECRET: secret, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

async function buildNodeEntry(): Promise<void> {
  const build = spawn("bun", ["build", "src/node.ts", "--target=node", "--outdir=dist/node"], {
    cwd,
    stdio: "inherit",
  });
  const code = await exitCode(build);
  if (code !== 0) throw new Error(`Node chat build failed with exit code ${String(code)}.`);
}

const output = captureOutput(worker);

try {
  await waitForServer();
  await verifyChat(endpoint, "local Node state");
  process.stdout.write("Node chat integration passed.\n");
} catch (cause) {
  const error = cause instanceof Error ? cause : new Error("Node chat integration failed.");
  error.message = `${error.message}\n\nNode output:\n${output()}`;
  throw error;
} finally {
  await stopChild(worker);
}

async function waitForServer(): Promise<void> {
  await waitFor(async () => {
    try {
      const response = await fetch(`${endpoint}/rpc`, {
        body: JSON.stringify({ calls: [] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      return response.ok;
    } catch {
      return false;
    }
  }, "local Node state");
}

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { waitFor } from "./chat-await.ts";
import { verifyChat } from "./chat-smoke.ts";
import { captureOutput, stopChild } from "./process-lifecycle.ts";

const port = 8_789;
const endpoint = `http://127.0.0.1:${port}/_cable`;
const secret = "local-integration-secret-with-at-least-32-bytes";
const stateDirectory = await mkdtemp(join(tmpdir(), "cable-chat-cloudflare-"));
const worker = spawn(
  "bunx",
  [
    "wrangler",
    "dev",
    "--local",
    "--port",
    String(port),
    "--var",
    `CABLE_GRANT_SECRET:${secret}`,
    "--persist-to",
    stateDirectory,
  ],
  { cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"] },
);

const output = captureOutput(worker);

try {
  await waitForWorker();
  await verifyChat(endpoint, "local Worker state");
  process.stdout.write("Cloudflare chat integration passed.\n");
} catch (cause) {
  const error = cause instanceof Error ? cause : new Error("Cloudflare chat integration failed.");
  error.message = `${error.message}\n\nWrangler output:\n${output()}`;
  throw error;
} finally {
  await stopChild(worker);
  await rm(stateDirectory, { force: true, recursive: true });
}

async function waitForWorker(): Promise<void> {
  await waitFor(async () => {
    try {
      const response = await startupProbe();
      return response.ok;
    } catch {
      return false;
    }
  }, "local Worker state");
}

async function startupProbe(): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 500);
  try {
    return await fetch(`${endpoint}/rpc`, {
      body: JSON.stringify({ calls: [] }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

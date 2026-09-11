import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient, type ChannelHandle } from "@cablejs/client";

import {
  waitFor,
  waitForOpen,
  within,
} from "../../../examples/chat-cloudflare/scripts/chat-await.ts";
import { captureOutput } from "../../../examples/chat-cloudflare/scripts/process-lifecycle.ts";
import { api } from "../../../examples/chat-cloudflare/src/api.ts";

const port = await availablePort();
const endpoint = `http://127.0.0.1:${String(port)}`;
const cableEndpoint = `${endpoint}/_cable`;
const secret = "local-integration-secret-with-at-least-32-bytes";
const commandTimeoutMs = 30_000;
const fixtureDirectory = new URL("..", import.meta.url);
const exampleDirectory = new URL("../../../examples/chat-cloudflare/", import.meta.url);
const generatedDirectory = await mkdtemp(join(tmpdir(), "cable-openapi-generated-client-"));
const stateDirectory = await mkdtemp(join(tmpdir(), "cable-openapi-interop-"));
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
  { cwd: exampleDirectory, stdio: ["ignore", "pipe", "pipe"] },
);
const output = captureOutput(worker);

try {
  await waitForWorker();
  await generateAndCompileClient();
  await verifyGeneratedRestAndPushes();
  process.stdout.write("OpenAPI generated-client interoperability passed.\n");
} catch (cause) {
  const error = cause instanceof Error ? cause : new Error("OpenAPI interoperability failed.");
  error.message = `${error.message}\n\nWrangler output:\n${output()}`;
  throw error;
} finally {
  await stopChild(worker);
  await Promise.all([
    rm(generatedDirectory, { force: true, recursive: true }),
    rm(stateDirectory, { force: true, recursive: true }),
  ]);
}

async function waitForWorker(): Promise<void> {
  await waitFor(workerReady, "OpenAPI document");
}

async function workerReady(): Promise<boolean> {
  throwIfWorkerExited();
  try {
    const response = await fetch(`${endpoint}/openapi.json`);
    throwIfWorkerExited();
    return response.ok;
  } catch {
    throwIfWorkerExited();
    return false;
  }
}

function throwIfWorkerExited(): void {
  const code = processExitCode(worker);
  if (code !== null)
    throw new Error(`Wrangler exited before serving OpenAPI with code ${String(code)}.`);
}

async function generateAndCompileClient(): Promise<void> {
  const schema = join(generatedDirectory, "schema.ts");
  const client = join(generatedDirectory, "client.ts");
  await symlink(
    new URL("node_modules/", fixtureDirectory),
    join(generatedDirectory, "node_modules"),
  );
  await run("bunx", [
    "--no-install",
    "openapi-typescript",
    `${endpoint}/openapi.json`,
    "-o",
    schema,
  ]);
  await copyFile(new URL("src/client.template", fixtureDirectory), client);
  await run("bunx", [
    "--no-install",
    "tsc",
    "--noEmit",
    "--exactOptionalPropertyTypes",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    "--noUncheckedIndexedAccess",
    "--strict",
    "--target",
    "ES2022",
    "--verbatimModuleSyntax",
    client,
  ]);
}

async function verifyGeneratedRestAndPushes(): Promise<void> {
  const observer = createClient({
    auth: { token: () => "Observer" },
    contract: api,
    url: cableEndpoint,
    ws: { idleClose: 0, reconnect: { jitter: false } },
  }).chat({ roomId: "interop" });
  const received: string[] = [];
  const statuses: string[] = [observer.status];
  const offStatus = observer.onStatus(() => {
    statuses.push(observer.status);
  });
  const messages = observeMessages(observer, received);
  try {
    await waitForOpen(observer);
    const restEvent = messages.next();
    await run("bun", [join(generatedDirectory, "client.ts")], {
      OPENAPI_INTEROP_ENDPOINT: endpoint,
    });
    await expectMessage(restEvent, "Hello from generated REST", "Alice");

    const notificationEvent = messages.next();
    const notification = await fetch(`${endpoint}/notifications`, {
      body: JSON.stringify({ roomId: "interop", text: "Hello from Hono" }),
      headers: { authorization: "Bearer Alice", "content-type": "application/json" },
      method: "POST",
    });
    if (!notification.ok) {
      throw new Error(`POST /notifications returned ${String(notification.status)}.`);
    }
    await expectMessage(notificationEvent, "Hello from Hono", "Alice");
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("WebSocket push verification failed.");
    error.message = `${error.message}\nReceived events: ${received.join(", ")}\nStatuses: ${statuses.join(", ")}`;
    throw error;
  } finally {
    messages.dispose();
    offStatus();
    observer.dispose();
  }
}

interface MessageObserver {
  dispose(): void;
  next(): Promise<Message>;
}

function observeMessages(
  room: ChannelHandle<typeof api.chat>,
  received: string[],
): MessageObserver {
  const queued: Message[] = [];
  const waiting: Array<(message: Message) => void> = [];
  const off = room.on("message", (message) => {
    received.push(`${message.user}: ${message.text}`);
    const resolve = waiting.shift();
    if (resolve === undefined) {
      queued.push(message);
      return;
    }
    resolve(message);
  });
  return {
    dispose: off,
    next() {
      const message = queued.shift();
      if (message !== undefined) return Promise.resolve(message);
      return new Promise((resolve) => {
        waiting.push(resolve);
      });
    },
  };
}

async function expectMessage(
  event: Promise<Message>,
  expectedText: string,
  expectedUser: string,
): Promise<void> {
  const message = await within(event, "WebSocket did not receive the HTTP-published message");
  if (message.text !== expectedText || message.user !== expectedUser) {
    throw new Error("WebSocket received the wrong HTTP-published message.");
  }
}

interface Message {
  readonly text: string;
  readonly user: string;
}

async function run(
  command: string,
  args: string[],
  environment?: NodeJS.ProcessEnv,
): Promise<void> {
  const child = spawn(command, args, {
    cwd: fixtureDirectory,
    env: environment === undefined ? process.env : { ...process.env, ...environment },
    stdio: "inherit",
  });
  try {
    const code = await exitCodeWithin(child, command);
    if (code !== 0)
      throw new Error(`${command} ${args.join(" ")} failed with exit code ${String(code)}.`);
  } catch (cause) {
    await stopChild(child);
    throw cause;
  }
}

function exitCodeWithin(child: ChildProcess, command: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${command} did not exit within ${String(commandTimeoutMs)}ms.`));
    }, commandTimeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function processExitCode(child: ChildProcess): number | null {
  return child.exitCode;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!isAddressInfo(address)) {
    await closeServer(server);
    throw new Error("The operating system did not assign a TCP port.");
  }
  await closeServer(server);
  return address.port;
}

function isAddressInfo(address: AddressInfo | string | null): address is AddressInfo {
  return address !== null && typeof address !== "string";
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
        return;
      }
      reject(error);
    });
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (processExitCode(child) !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    once(child, "exit"),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (processExitCode(child) !== null) return;
  child.kill("SIGKILL");
  await once(child, "exit");
}

import type { ChildProcess } from "node:child_process";
import { once } from "node:events";

export function exitCode(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => child.once("exit", resolve));
}

export function captureOutput(child: ChildProcess): () => string {
  let output = "";
  const append = (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-4_000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return () => output;
}

export async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    once(child, "exit"),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  child.kill("SIGKILL");
}

import { execFileSync } from "node:child_process";

function git(args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

/** Install this repository's pre-push gate without replacing a custom hook path. */
export function setupGitHooks(): void {
  if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") return;
  const configured = git(["config", "--local", "--get", "core.hooksPath"]);
  if (configured === undefined || configured === ".githooks") {
    git(["config", "--local", "core.hooksPath", ".githooks"]);
    return;
  }
  console.warn(
    `Git hooks remain at ${configured}; run .githooks/pre-push through your existing hook path.`,
  );
}

setupGitHooks();

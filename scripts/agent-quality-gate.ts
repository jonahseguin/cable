import { execFileSync, spawnSync } from "node:child_process";
/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, typescript/no-unsafe-type-assertion -- SAFETY: this standalone hook parses untrusted JSON at its only I/O boundary. The parsers below reject non-object input and retain every field as unknown until checked. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The subset of native hook input used by both Claude Code and Codex. */
export interface HookInput {
  readonly cwd?: unknown;
  readonly hook_event_name?: unknown;
  readonly session_id?: unknown;
  readonly stop_hook_active?: unknown;
}

export interface RootState {
  readonly baseline: string;
  readonly successful?: string;
  readonly unverified?: string;
}

export interface SessionState {
  readonly roots: Readonly<Record<string, RootState>>;
}

interface CheckResult {
  readonly result?: GateResult;
  readonly state: RootState;
}

export interface GateResult {
  readonly decision?: "block";
  readonly reason?: string;
  readonly systemMessage?: string;
}

export interface GateEnvironment {
  readonly fingerprint: (root: string) => string;
  readonly readState: (root: string, sessionId: string) => SessionState | undefined;
  readonly runCheck: (root: string) => boolean;
  readonly writeState: (root: string, sessionId: string, state: SessionState) => void;
}

const qualityFailure =
  "The required `bun run check` did not verify this repository state. Fix it or report the failed quality gate as the blocker; do not describe the work as verified.";

/** Capture the session baseline before an agent can change repository content. */
export function startSession(
  input: HookInput,
  environment: GateEnvironment,
  root: string,
): GateResult {
  const sessionId = sessionIdFrom(input);
  const state = environment.readState(root, sessionId);
  if (state?.roots[root] !== undefined) return {};
  environment.writeState(root, sessionId, {
    roots: { ...state?.roots, [root]: { baseline: environment.fingerprint(root) } },
  });
  return {};
}

/** Enforce one successful full check for each repository state changed during this session. */
export function stopSession(
  input: HookInput,
  environment: GateEnvironment,
  root: string,
): GateResult {
  const sessionId = sessionIdFrom(input);
  const state = environment.readState(root, sessionId);
  const roots = { ...state?.roots };
  if (roots[root] === undefined) {
    if (state !== undefined) {
      const current = environment.fingerprint(root);
      roots[root] = { baseline: current, unverified: current };
      environment.writeState(root, sessionId, { roots });
      return input.stop_hook_active === true
        ? { systemMessage: qualityFailure }
        : {
            decision: "block",
            reason:
              "The session moved to another repository or worktree before this Stop. Its starting repository remains unverified; report that blocker or return to it and run the gate.",
          };
    }
    const checked = checkRoot(input, environment, root);
    roots[root] = checked.state;
    environment.writeState(root, sessionId, { roots });
    return checked.result ?? {};
  }
  const checked = checkRoot(input, environment, root, roots[root]);
  roots[root] = checked.state;
  environment.writeState(root, sessionId, { roots });
  return checked.result ?? {};
}

function checkRoot(
  input: HookInput,
  environment: GateEnvironment,
  root: string,
  state?: RootState,
): CheckResult {
  const current = environment.fingerprint(root);
  if (state?.unverified === current && input.stop_hook_active === true)
    return { result: { systemMessage: qualityFailure }, state };
  if (state !== undefined && (state.baseline === current || state.successful === current))
    return { state };

  const passed = environment.runCheck(root);
  const after = environment.fingerprint(root);
  if (passed && current === after) {
    return { state: { baseline: state?.baseline ?? current, successful: after } };
  }
  return {
    result: {
      decision: "block",
      reason:
        current === after
          ? qualityFailure
          : "Repository content changed while `bun run check` ran. Run it again against the final state, or report that verification is blocked.",
    },
    state: { baseline: state?.baseline ?? current, unverified: after },
  };
}

/** Hash the checked-out commit, tracked worktree content, and untracked file content. */
function repositoryFingerprint(root: string): string {
  const hash = createHash("sha256");
  hash.update(git(root, ["rev-parse", "HEAD"]));
  hash.update(git(root, ["diff", "--no-ext-diff", "--binary", "HEAD"]));
  for (const path of git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0")) {
    if (path.length === 0) continue;
    hash.update(path);
    hash.update(readFileSync(join(root, path)));
  }
  return hash.digest("hex");
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function defaultEnvironment(): GateEnvironment {
  return {
    fingerprint: repositoryFingerprint,
    readState,
    runCheck: (root) =>
      spawnSync("bun", ["run", "check"], { cwd: root, stdio: "inherit" }).status === 0,
    writeState,
  };
}

function cachePath(_root: string, sessionId: string): string {
  const sessionHash = createHash("sha256").update(sessionId).digest("hex");
  return join(tmpdir(), "cable-agent-quality", `${sessionHash}.json`);
}

function readState(root: string, sessionId: string): SessionState | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(cachePath(root, sessionId), "utf8"));
    if (!isState(value)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function writeState(root: string, sessionId: string, state: SessionState): void {
  const path = cachePath(root, sessionId);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
  renameSync(temporary, path);
}

function isState(value: unknown): value is SessionState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  // SAFETY: the object, null, and array representations were rejected above.
  const candidate = value as Record<string, unknown>;
  const { roots } = candidate;
  if (typeof roots !== "object" || roots === null || Array.isArray(roots)) return false;
  // SAFETY: roots was checked as a non-array object before its own fields are read.
  return Object.values(roots as Record<string, unknown>).every(isRootState);
}

function isRootState(value: unknown): value is RootState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  // SAFETY: the object, null, and array representations were rejected above.
  const candidate = value as Record<string, unknown>;
  const { baseline, successful, unverified } = candidate;
  return (
    typeof baseline === "string" &&
    (successful === undefined || typeof successful === "string") &&
    (unverified === undefined || typeof unverified === "string")
  );
}

function sessionIdFrom(input: HookInput): string {
  return typeof input.session_id === "string" && input.session_id.length > 0
    ? input.session_id
    : "unknown";
}

function rootFrom(input: HookInput): string {
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  return git(resolve(cwd), ["rev-parse", "--show-toplevel"]).trim();
}

function main(): void {
  let input: HookInput;
  try {
    const raw = readFileSync(0, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new Error("Hook input must be an object.");
    input = parsed;
  } catch {
    process.stdout.write(
      JSON.stringify({ decision: "block", reason: "Quality hook received invalid input." }),
    );
    return;
  }

  try {
    const root = rootFrom(input);
    const environment = defaultEnvironment();
    const result =
      input.hook_event_name === "SessionStart"
        ? startSession(input, environment, root)
        : stopSession(input, environment, root);
    process.stdout.write(JSON.stringify(result));
  } catch {
    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason: "Quality hook could not access the repository state.",
      }),
    );
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main();

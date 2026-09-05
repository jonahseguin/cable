#!/usr/bin/env -S pnpm exec tsx

// Probes what a large shrink costs the commit transaction.
//
// `collect_truncate_cleanup` clears one PIDX row per page above the new EOF
// inside the commit that shrinks the database, and nothing bounds that by the
// dirty page cap: a commit can dirty a handful of pages while dropping millions.
// This grows a database, deletes almost all of it, and vacuums, so the shrink
// lands as one commit with a small dirty set and a very large EOF drop.

import { createClient } from "rivetkit/client";
import type { registry } from "../src/index.ts";

const ROW_BYTES = 4_000;

function envNum(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined || raw === "") return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} must be a positive number, got ${raw}`);
	}
	return Math.floor(value);
}

function log(record: Record<string, unknown>): void {
	console.log(JSON.stringify(record));
}

async function main(): Promise<void> {
	const endpoint = process.env.RIVET_ENDPOINT;
	if (!endpoint) throw new Error("RIVET_ENDPOINT is required");
	const rows = envNum("RESIDUE_ROWS", 260_000);
	const perCommit = envNum("RESIDUE_ROWS_PER_COMMIT", 8_000);
	const keepRows = envNum("RESIDUE_KEEP_ROWS", 500);
	const runId = process.env.SUITE_RUN_ID ?? "res1";

	const client = createClient<typeof registry>(endpoint);
	const handle = client.largeCommitDb.getOrCreate(`lc-${runId}-residue`);

	// Grown in chunks that each stay under the commit cap, since the point is
	// the shrink and not another large-commit test.
	const batches = Math.ceil(rows / perCommit);
	const grownAt = Date.now();
	const grown = await handle.write({
		rows: batches * perCommit,
		rowBytes: ROW_BYTES,
		batches,
		random: true,
	});
	log({
		event: "grown",
		pages: grown.pageCount,
		mib: Math.round((grown.sizeBytes / (1024 * 1024)) * 10) / 10,
		commits: batches,
		elapsedMs: Date.now() - grownAt,
	});

	const shrunkAt = Date.now();
	try {
		const shrunk = await handle.shrink({ keepRows });
		log({
			event: "shrunk",
			...shrunk,
			elapsedMs: Date.now() - shrunkAt,
		});
	} catch (err) {
		log({
			event: "shrink_error",
			error: err instanceof Error ? err.message : String(err),
			elapsedMs: Date.now() - shrunkAt,
		});
		process.exitCode = 1;
		return;
	}

	const verified = await handle.verify({ rowBytes: ROW_BYTES, random: true });
	log({
		event: "verified",
		ok: verified.ok,
		integrity: verified.integrity,
		rows: verified.rows,
	});
	if (!verified.ok) process.exitCode = 1;
}

main().catch((err) => {
	log({
		event: "fatal",
		error: err instanceof Error ? err.message : String(err),
	});
	process.exitCode = 1;
});

#!/usr/bin/env -S pnpm exec tsx

// Drives depot's segmented staged commit path against a live engine.
//
// The unit tests bound the finalize transaction and prove a commit at the cap
// publishes. What they cannot cover is the whole path end to end: SQLite's own
// page allocation choosing the dirty set, the VFS cutting it into segments, the
// tunnel carrying them, and the engine folding and reading them back. This
// script exercises that, and checks the two things that only fail at scale:
// content correctness and what a large commit costs.
//
//   RIVET_ENDPOINT="http://default:dev@127.0.0.1:6420" RIVET_POOL=k8s \
//   node --import tsx scripts/large-commit-suite.ts
//
// SUITE_RUN_ID scopes the actor keys, so a rerun against a dirty cluster picks
// fresh databases rather than appending to the previous run's.

import { createClient } from "rivetkit/client";
import type { registry } from "../src/index.ts";

// Depot applies a commit at or under this many dirty pages in one transaction
// and stages anything larger in shard-aligned segments.
const SINGLE_SHOT_MAX_PAGES = 320;
// Pages one staged segment carries, so a commit's segment count is predictable.
const PAGES_PER_SEGMENT = 320;
// The engine's total commit cap.
const MAX_COMMIT_PAGES = 32_768;

const ROW_BYTES = 4_000;

interface Case {
	name: string;
	rows: number;
	batches: number;
	// What the case is supposed to demonstrate, printed with the result so a log
	// reader does not have to infer intent from the numbers.
	expect: string;
}

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
	const runId = process.env.SUITE_RUN_ID ?? "lc1";
	const only = process.env.SUITE_ONLY;
	const capRows = envNum("SUITE_CAP_ROWS", MAX_COMMIT_PAGES);

	const client = createClient<typeof registry>(endpoint);
	let failures = 0;

	const cases: Case[] = [
		{
			name: "single-shot",
			rows: SINGLE_SHOT_MAX_PAGES - 16,
			batches: 1,
			expect: "under the cap, so one message and one FDB transaction",
		},
		{
			name: "just-over-threshold",
			rows: SINGLE_SHOT_MAX_PAGES + 16,
			batches: 1,
			expect: "first commit that stages, and it stages two segments",
		},
		{
			name: "multi-segment",
			rows: 2_000,
			batches: 1,
			expect: "~7 segments, the ordinary large-commit shape",
		},
		{
			name: "many-segment",
			rows: 20_000,
			batches: 1,
			expect: "~63 segments, past any single compaction batch budget",
		},
	];

	for (const testCase of cases) {
		if (only && !only.split(",").includes(testCase.name)) continue;
		const key = `lc-${runId}-${testCase.name}`;
		const handle = client.largeCommitDb.getOrCreate(key);
		const startedAt = Date.now();
		try {
			const written = await handle.write({
				rows: testCase.rows,
				rowBytes: ROW_BYTES,
				batches: testCase.batches,
			});
			const verified = await handle.verify({ rowBytes: ROW_BYTES });
			if (!verified.ok) failures += 1;
			log({
				event: "case",
				name: testCase.name,
				expect: testCase.expect,
				key,
				ok: verified.ok,
				rows: written.rowsWritten,
				pagesDirtied: written.pagesDirtied,
				estimatedSegments:
					written.pagesDirtied > SINGLE_SHOT_MAX_PAGES
						? Math.ceil(written.pagesDirtied / PAGES_PER_SEGMENT)
						: 0,
				pageCount: verified.pageCount,
				sizeMib:
					Math.round((verified.sizeBytes / (1024 * 1024)) * 10) / 10,
				commitMs: written.slowestBatchMs,
				integrity: verified.integrity,
				mismatchedRows: verified.mismatchedRows,
				idGaps: verified.idGaps,
				elapsedMs: Date.now() - startedAt,
			});
		} catch (err) {
			failures += 1;
			log({
				event: "case_error",
				name: testCase.name,
				key,
				error: err instanceof Error ? err.message : String(err),
				elapsedMs: Date.now() - startedAt,
			});
		}
	}

	// Equivalence: the same content written as one staged commit and as many
	// single-shot commits must produce the same database. This is the property
	// segmentation has to preserve, and the one a fold bug breaks silently.
	if (!only || only.split(",").includes("equivalence")) {
		const rows = envNum("SUITE_EQUIV_ROWS", 4_000);
		const startedAt = Date.now();
		try {
			const staged = client.largeCommitDb.getOrCreate(
				`lc-${runId}-equiv-staged`,
			);
			const chunked = client.largeCommitDb.getOrCreate(
				`lc-${runId}-equiv-chunked`,
			);
			const stagedWrite = await staged.write({
				rows,
				rowBytes: ROW_BYTES,
				batches: 1,
			});
			// 250 rows per batch keeps every one of these under the 320-page
			// single-shot cap, so this side never stages.
			const chunkedWrite = await chunked.write({
				rows,
				rowBytes: ROW_BYTES,
				batches: rows / 250,
			});
			const [stagedPrint, chunkedPrint] = await Promise.all([
				staged.fingerprint(),
				chunked.fingerprint(),
			]);
			const [stagedVerify, chunkedVerify] = await Promise.all([
				staged.verify({ rowBytes: ROW_BYTES }),
				chunked.verify({ rowBytes: ROW_BYTES }),
			]);
			const sameContent =
				JSON.stringify(stagedPrint) === JSON.stringify(chunkedPrint);
			const ok =
				sameContent &&
				stagedVerify.ok &&
				chunkedVerify.ok &&
				stagedVerify.pageCount === chunkedVerify.pageCount;
			if (!ok) failures += 1;
			log({
				event: "case",
				name: "equivalence",
				expect: "one staged commit equals the same rows as many small commits",
				ok,
				rows,
				sameContent,
				stagedPages: stagedVerify.pageCount,
				chunkedPages: chunkedVerify.pageCount,
				stagedCommitMs: stagedWrite.slowestBatchMs,
				chunkedSlowestCommitMs: chunkedWrite.slowestBatchMs,
				stagedPrint,
				chunkedPrint,
				stagedIntegrity: stagedVerify.integrity,
				chunkedIntegrity: chunkedVerify.integrity,
				elapsedMs: Date.now() - startedAt,
			});
		} catch (err) {
			failures += 1;
			log({
				event: "case_error",
				name: "equivalence",
				error: err instanceof Error ? err.message : String(err),
				elapsedMs: Date.now() - startedAt,
			});
		}
	}

	// Scattered overwrite. Appending only ever dirties pages at the end of the
	// file; rewriting every row dirties the whole page space, so the commit cuts
	// into many more segments and finalize rewrites PIDX rows that already had
	// owners. That is the shape a partial fold gets wrong.
	if (!only || only.split(",").includes("rewrite")) {
		const key = `lc-${runId}-rewrite`;
		const startedAt = Date.now();
		try {
			const handle = client.largeCommitDb.getOrCreate(key);
			await handle.write({
				rows: 6_000,
				rowBytes: ROW_BYTES,
				batches: 20,
			});
			const before = await handle.fingerprint();
			const rewritten = await handle.rewriteAll({ rowBytes: ROW_BYTES });
			const verified = await handle.verify({ rowBytes: ROW_BYTES });
			const after = await handle.fingerprint();
			const ok =
				verified.ok && JSON.stringify(before) === JSON.stringify(after);
			if (!ok) failures += 1;
			log({
				event: "case",
				name: "rewrite",
				expect: "rewriting every row in one commit changes nothing observable",
				key,
				ok,
				pageCount: verified.pageCount,
				commitMs: rewritten.slowestBatchMs,
				integrity: verified.integrity,
				mismatchedRows: verified.mismatchedRows,
				contentUnchanged:
					JSON.stringify(before) === JSON.stringify(after),
				elapsedMs: Date.now() - startedAt,
			});
		} catch (err) {
			failures += 1;
			log({
				event: "case_error",
				name: "rewrite",
				error: err instanceof Error ? err.message : String(err),
				elapsedMs: Date.now() - startedAt,
			});
		}
	}

	// Byte volume under the actor throttle. Random rows so a commit costs what
	// its page count implies: the deterministic payload compresses by around
	// forty times, which makes every byte-volume number meaningless.
	if (only?.split(",").includes("throttle")) {
		const rows = envNum("SUITE_THROTTLE_ROWS", 8_000);
		const passes = envNum("SUITE_THROTTLE_PASSES", 6);
		const key = `lc-${runId}-throttle`;
		try {
			const handle = client.largeCommitDb.getOrCreate(key);
			for (let pass = 0; pass < passes; pass += 1) {
				const startedAt = Date.now();
				const written = await handle.write({
					rows,
					rowBytes: ROW_BYTES,
					batches: 1,
					random: true,
				});
				log({
					event: "throttle_pass",
					pass,
					pagesDirtied: written.pagesDirtied,
					mib: Math.round(
						(written.pagesDirtied * 4096) / (1024 * 1024),
					),
					commitMs: written.slowestBatchMs,
					elapsedMs: Date.now() - startedAt,
				});
			}
			const verified = await handle.verify({
				rowBytes: ROW_BYTES,
				random: true,
			});
			if (!verified.ok) failures += 1;
			log({
				event: "case",
				name: "throttle",
				expect: "incompressible commits, so byte volume matches page count",
				key,
				ok: verified.ok,
				pageCount: verified.pageCount,
				sizeMib: Math.round(verified.sizeBytes / (1024 * 1024)),
				integrity: verified.integrity,
				mismatchedRows: verified.mismatchedRows,
				idGaps: verified.idGaps,
			});
		} catch (err) {
			failures += 1;
			log({
				event: "case_error",
				name: "throttle",
				key,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	// A commit at the cap, end to end. The unit test proves the engine accepts
	// one; this proves SQLite, the VFS, the tunnel, and the engine agree on it.
	if (only?.split(",").includes("at-cap")) {
		const key = `lc-${runId}-at-cap`;
		const startedAt = Date.now();
		try {
			const handle = client.largeCommitDb.getOrCreate(key);
			const written = await handle.write({
				rows: capRows,
				rowBytes: ROW_BYTES,
				batches: 1,
			});
			const verified = await handle.verify({ rowBytes: ROW_BYTES });
			if (!verified.ok) failures += 1;
			log({
				event: "case",
				name: "at-cap",
				expect: "a commit at or near the 32,768-page cap publishes intact",
				key,
				ok: verified.ok,
				rows: written.rowsWritten,
				pagesDirtied: written.pagesDirtied,
				estimatedSegments: Math.ceil(
					written.pagesDirtied / PAGES_PER_SEGMENT,
				),
				sizeMib:
					Math.round((verified.sizeBytes / (1024 * 1024)) * 10) / 10,
				commitMs: written.slowestBatchMs,
				integrity: verified.integrity,
				mismatchedRows: verified.mismatchedRows,
				idGaps: verified.idGaps,
				elapsedMs: Date.now() - startedAt,
			});
		} catch (err) {
			failures += 1;
			log({
				event: "case_error",
				name: "at-cap",
				error: err instanceof Error ? err.message : String(err),
				elapsedMs: Date.now() - startedAt,
			});
		}
	}

	log({ event: "suite_end", failures, ok: failures === 0 });
	if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

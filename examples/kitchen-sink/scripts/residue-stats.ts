#!/usr/bin/env -S pnpm exec tsx

// Reads a residue-probe database back after a restart, so the size the engine
// believes in is what answers rather than the client's in-memory view.

import { createClient } from "rivetkit/client";
import type { registry } from "../src/index.ts";

async function main(): Promise<void> {
	const endpoint = process.env.RIVET_ENDPOINT;
	if (!endpoint) throw new Error("RIVET_ENDPOINT is required");
	const key = process.env.RESIDUE_KEY ?? "lc-res1-residue";
	const client = createClient<typeof registry>(endpoint);
	const handle = client.largeCommitDb.getOrCreate(key);
	console.log(JSON.stringify({ event: "stats", ...(await handle.stats()) }));
	console.log(
		JSON.stringify({
			event: "verify",
			...(await handle.verify({ rowBytes: 4000, random: true })),
		}),
	);
}

main().catch((err) => {
	console.log(
		JSON.stringify({ event: "error", error: err?.message ?? String(err) }),
	);
	process.exitCode = 1;
});

# Depot compaction flow (hot + reclaim)

The end-to-end lifecycle of the workflow-driven compaction system: how a commit
propagates through hot compaction and reclaim, and what FDB footprint to expect once
the work has settled.

> **Here because "the size is not going down"?** Read
> [Settled state](#phase-6--settled-state-what-should-remain) first, and do not reach for a
> steady-state multiple to explain it. A settled branch should sit at **~1x its logical size**.
> There is no designed 2x resting state.
> Anything materially above that number is a defect; the known ones are named below, each with a
> probe that distinguishes it from correctly-retained data.

Everything is **per `database_branch_id`**. Each branch has three Gasoline workflows:

- `db_manager2` — orchestrator; owns compaction publish and deletion authority.
- `db_hot_compactor2` — hot companion (fold DELTA → SHARD).
- `db_reclaimer2` — reclaim companion (delete dead/aged rows).

Companions are **signal-driven**: they sleep until the manager signals them, self-plan
and drain their full backlog in an internal durable `loope`, then signal the manager
once. The manager installs the merged output, advancing the watermark and bumping the
manifest generation a single time.

FDB is the durable source of truth; there is no second tier. Reclaim chains off hot install.

## Watermarks (the spine)

```
hot_watermark_txid  ≤  head_txid
```

- `head_txid` — latest committed txn.
- `hot_watermark_txid` — up to here, DELTA pages have been folded into SHARDs (`CMP/root.hot_watermark_txid`).

`CMP/root` also carries `cold_watermark_txid`. It is part of the persisted record so a branch
stays readable across builds, and it stays 0 here. `depot::burst_mode` derives its signal from
`head_txid - cold_watermark_txid`, so every branch past `HOT_BURST_COLD_LAG_THRESHOLD_TXIDS` reads
as permanently lagging and runs with the `HOT_BURST_MULTIPLIER` hot quota cap.

## Timeline

### Phase 0 — Idle
Manager sits in its durable `lupe`, blocked in `listen_for_manager_signals` →
`listen_n_until(deadline)`. Companions sleep on their signal listeners. Timers:
reclaim every `sqlite.manager_reclaim_interval_ms` (default 10 min). It is re-armed only when a
signal arrived, so once it has fired on a branch nobody writes to, the manager falls
back to the idle poll (`sqlite.manager_idle_poll_interval_ms`, default 12 h, jittered +/-10% per
branch). It never blocks without a deadline.

Only commits signal the manager (`conveyer/commit/apply.rs`); a read touches `SHARD_ACCESS` and
`SHARD_LRU` and sends nothing. So a branch that stops being written must fall back to the idle poll
to keep a deadline armed, or it blocks here forever and every reclaim lane stalls with it. See
[known defects](#known-defects-that-look-like-expected-retention).

### Phase 1 — Write / commit
A SQLite commit (pegboard-envoy → `Db::commit`) writes, per txn:
- `COMMITS/{txid_be}` (`SetVersionstampedValue`) + `VTX/{versionstamp}` (`SetVersionstampedKey` → raw u64 BE txid),
- `DELTA/{txid}/{chunk}` blobs — the dirtied pages, chunked at 10 KB,
- `PIDX` page-owner updates, `/META/head` advance.

It sets the `SQLITE_CMP_DIRTY` marker and fires a **`DeltasAvailable`** signal to the
manager (via `CompactionSignaler`).

### Phase 2 — Manager plans (`RefreshManager`)
Manager wakes on the signal (or a timer), runs a `RefreshManager` activity: reads an FDB
snapshot, recomputes hot lag (`head − hot_watermark`), and emits typed planned jobs for the
hot and reclaim lanes (`RefreshManagerOutput`).

### Phase 3 — HOT compaction (always on)
1. Manager signals **`RunHotJob`** to `db_hot_compactor2`.
2. Hot companion pins the drain-start head `H0` and PITR clock `T0`, then in an internal
   durable `loope` drains **every** slice in `[hot_watermark+1 .. H0]` (bounded per job by
   `MAX_HOT_DRAIN_SPAN_TXIDS`, caught up incrementally across cycles), writing merged
   **staged** LTX shard blobs under `CMP/stage/{job_id}/hot_shard`. Signals the manager
   once (`HotJobFinished`).
3. Manager runs **hot install** as a resumable bulk activity
   (`execute_install_hot_output_effect`): copies staged shards into live `SHARD/...`,
   clears folded `PIDX` with `COMPARE_AND_CLEAR`, and in a final txn advances
   `CMP/root.hot_watermark_txid → H0` and bumps `manifest_generation` once. Writes are
   throttled (see below); on early timeout it returns a resume cursor and re-dispatches.

The watermark does not always reach `H0`. A slice admits whole commits only, so a commit whose own
value plus delta chunks plus reserved PIDX rows exceeds the slice budget can never be admitted. When
that commit is the first one a window looks at, the drain stops below it, install reports the txid,
and the final txn advances `hot_watermark_txid` to `txid - 1` rather than `H0`. Every later pass
meets the same commit, warns, and plans nothing, so the branch sits at that watermark until the
budget grows. Watch for the plan-nothing warning; a branch stuck below `head_txid` with no
compaction progress is this case, not a stalled manager.

After hot install, DELTA pages ≤ `hot_watermark` are materialized in SHARDs. The DELTA
blobs are **still retained** (Phase 6).

### Phase 4 — RECLAIM (after hot install)
Manager signals **`RunReclaimJob`** to `db_reclaimer2`. One signal drains the branch's
**entire** eligible backlog in an internal `loope`. The scanning lanes are windowed behind
durable cursors: the commit/delta lane walks `COMMITS` from `commit_scan_cursor`, advancing
across passes. A slice that plans no deletes is therefore **not** terminal; the drain stops
only when the scan reports its range exhausted (`commit_scan_complete`) or the slice is
rejected. Plan and delete re-derive from the same cursor or OCC rejects every slice past
the first. All delete lanes share one `CompactionBatchBudget`, are fenced by branch
lifecycle generation + manifest generation OCC, use `COMPARE_AND_CLEAR`, and charge the same
shared budget as hot install (against a larger view of it, see "Throttle lanes"):

- **Folded DELTA chunks** whose pages are fully materialized in SHARDs *and* no longer
  `live_owned` (no page they wrote still has `PIDX[pgno] == txid`), gated by the shared slice
  budget (billable → quota credited back). There is **no wall-clock term** in this gate.
- **Dead SHARD versions** superseded by a newer version with no coverage txid in between (the
  `SweepDeadShardVersions` walk). There is no margin term: `SHARD_RETENTION_MARGIN` is declared in
  `conveyer/constants.rs` but referenced by no compaction path, same as `HOT_RETENTION_FLOOR_MS`.
- **Stale `PIDX` rows** left by a hot slice that folded a page without clearing its owner row, via
  the one-shot `SweepStalePidx` repair. Clearing one releases the delta and commit it was pinning.
- **Expired `PITR_INTERVAL`** rows; **COMMITS/VTX** for non-fold reclaimable txids.
Reclaimer signals `ReclaimJobFinished`.

**PITR history has no second home.** Restore points and PITR intervals are served entirely from
retained hot rows, so retention pressure lands on FDB.

### Phase 6 — Settled state: what should remain

"Settled" means: no writes in flight, `head_txid == hot_watermark_txid`, the reclaim drain has
exhausted its scans, and no forks or restore points are pinning history.

**A settled branch is ~1x its logical size.** Every folded delta clears both reclaim gates
(`live_owned` false once install cleared the PIDX rows, and the materialization gate satisfied by
the drain's own fold), `reclaim_delete_upper_bound` is `hot_watermark`, so COMMITS/VTX go with them,
and PIDX is cleared for folded pages. What remains is the newest `SHARD` version per shard.

That is both the floor and the resting state. There is no eviction lane, so a branch never drops
below its logical size; and nothing caps `reclaim_delete_upper_bound` short of `hot_watermark`, so a
settled branch sheds its folded DELTA and COMMITS/VTX entirely rather than resting above it.

Reaching that state on a branch nobody writes to takes up to one manager idle poll
(`sqlite.manager_idle_poll_interval_ms`, default 12 h, jittered +/-10% per branch). The last write's
compaction settles, the manager sees no further signal, and it falls back to the idle poll; one
reclaim job then drains the whole backlog.

#### What is legitimately retained above those numbers

- **Unfolded DELTAs** — deltas for txids above `hot_watermark`. Correctly retained until the next hot
  pass folds them. By definition absent once settled.
- **`live_owned` DELTAs** — a folded delta is retained while any page it wrote still owns its `PIDX`
  entry, because it is the current version of that page. In a settled branch this set should be
  **empty**: install clears the PIDX rows for every page it folds. A settled branch with many
  `live_owned` deltas below `hot_watermark` is the stale-PIDX defect, not normal retention — see
  below.
- **PITR coverage** — PITR is opt-in (`sqlite.pitr`, absent by default). When enabled, each retained
  coverage position is a coverage txid, and hot staging folds a *complete image of every shard that
  position covers*. Live shard versions therefore scale with `retention_ms / interval_ms`: the
  built-in 5 min / 7 day settings are 2016 positions, so a continuously written shard holds up to
  2016 live 256 KiB versions. Those versions are pinned, not dead, until the interval row expires, so
  reclaim cannot drop them. Treat that ratio as the knob, not either value alone. This is the one
  configuration that legitimately multiplies resting footprint.
- **PITR retention** — unexpired `PITR_INTERVAL` rows (whose `expires_at_ms` is the branch's
  *configured* PITR window, per interval — **not** a fixed 7-day constant) keep their txids in
  the reclaim coverage set. A covered delta still reclaims once its shard is materialized at
  the coverage fold; the coverage only holds COMMITS/VTX below the pinned floor.
- **Fork / restore-point pins** — `DB_PIN` records are exact coverage targets and hold their history.
- **In-flight drain** — transient only. The reclaim scan is windowed behind `commit_scan_cursor`
  and advances across passes until its range is exhausted, so this clears on its own. It explains a residual for minutes after a compaction storm, never a resting one. (A
  scan that restarted every slice would spend the whole window on retained rows and report "nothing
  reclaimable" forever; do not reintroduce that shape.)
- **Frozen-branch retention** — `FROZEN_BRANCH_RETENTION_MS = 30 days`. GC is a dependency-graph
  walk (not wall-clock): history is deletable only when older than the PITR window **and** not
  pinned by any descendant branch's fork point. Pins recompute per pass and can decrease as
  descendants are swept.

#### Known defects that look like "expected retention"

Both were mistaken for normal steady state before being diagnosed. Check these before concluding
a branch is behaving correctly.

1. **Stale PIDX ownership survives the hot fold.** A hot slice folds pages but leaves their `PIDX`
   rows set, so the watermark advances while those pages are still delta-owned. The deltas stay
   `live_owned` forever and pin their `COMMITS` rows with them; measured at ~2.4x baseline on a
   many-small-commits workload. The clear lane shares its slice budget with commit selection, so a
   run of small commits could starve it (prevention landed in `fix(depot): reserve hot slice budget
   for pidx clears`; already-stranded rows need the `SweepStalePidx` repair, since the owner-window
   filter in `read_hot_input_snapshot` can never revisit them).
   **Probe:** `GET /depot/inspect/branches/{branch_id}` reports this under
   `compaction.stale_pidx`. `stale_rows` is every `/PIDX/{pgno}` entry whose owner txid is
   `<= CMP/root.hot_watermark_txid`, and zero is healthy; `pinned_delta_estimated_bytes` is the
   unreclaimable footprint those rows hold down. `pidx_repair.swept` distinguishes "swept clean"
   from "never swept", and `swept_at_hot_watermark_txid` is the watermark that walk ran at. Check `scan_truncated` before trusting a zero: a truncated scan reports a
   lower bound, and raising `scan_limit` gets an exact answer. An orphan-style check reports healthy
   here and will mislead you.
2. **A dormant branch's manager parks and never reclaims.** Reads never signal the manager (only
   `conveyer/commit/apply.rs` does), and `schedule_next_wake` used to re-arm its planning timers only
   when a signal arrived, so a branch that stopped being written blocked on a deadline-less listen.
   The dead-shard sweep and the one-shot `SweepStalePidx` repair are both dispatched through a
   reclaim job, so both stalled. `schedule_next_wake` now always leaves a
   deadline armed, falling back to `sqlite.manager_idle_poll_interval_ms` when no signal arrived, so
   the worst case is one poll interval of duplicate hot copies rather than forever.
   **Probe:** `compaction.reclaim_progress` on the branch endpoint dates the last reclaim plan pass
   and shows where its scan stopped, so a parked manager shows up as a stale `updated_at_ms` rather
   than requiring a read of the reclaimer's Gasoline history.
#### Reading the numbers

Both `dirty_branches` and `queued_compaction_rows` at 0 in `depot/inspect/summary` mean there is no
pending compaction work. At that point the footprint should already match the settled numbers above.
If it does not, it is one of the defects above, or genuine PITR/pin retention — not a drain tail and
not a steady-state multiple.

Take footprint from `row_families.{family}.estimated_bytes` on the branch endpoint. That comes from
FoundationDB's range-size estimate, which takes no scan and stays accurate at branch scale, so it is
reported even for `DELTA` and `SHARD` whose row counts are deliberately cut short. The sibling `rows`
count is exact only when `rows_truncated` is false.

> **Note on `HOT_RETENTION_FLOOR_MS` / `HOT_CACHE_WINDOW_MS` (both `7 days`).** These constants
> exist in `conveyer/constants.rs` but are **not referenced by any reclaim or compaction code
> path** (only by constant-value tests and one restore-point test). They do **not** gate delta
> reclaim. Do not attribute retained delta footprint to a 7-day floor.

## Throttle classes

Every bulk pass charges one cluster-wide budget (`sqlite.compaction_{read,write}_bytes_per_second`)
and checks it with a `CompactionThrottleClass`. The class does not change what anything charges; it
scales the budget that caller's admission ramp is evaluated against. Since every class reads the same
estimate, ordering the budgets orders the callers.

Membership is by **what a caller does to the FoundationDB footprint**, not by which workflow it runs
in:

| Class | Callers | Default budget view |
| --- | --- | --- |
| `Stage` | hot staging, only while it writes a second copy | 0.3x |
| `Install` | hot install, direct-to-shard hot folds | 1.0x |
| `Reclaim` | every reclaim lane | 1.5x |

`Stage` exists to bound a duplicate. With `sqlite.compaction_hot_fold_direct_to_shard` off, a fold
lands in the staging area and hot install copies it into the live shard tier byte for byte, so the
same page sits in FoundationDB twice and neither copy is releasable until the install runs. Staging
that outruns install grows the footprint on both sides at once and leaves staged output nothing else
can consume, so it stops admitting at 30% of the total compaction byte rate, which reserves the rest
for the callers that drain. Such a slice also backs off for
`sqlite.compaction_stage_throttle_backoff_ms` (30s) rather than `THROTTLE_BACKOFF_MS` (2.5s), because
admission is probabilistic and a slice retrying inside the same window keeps rolling dice against the
estimate the other callers are working under.

One caller a lane-shaped reading would put in `Stage` is `Install` instead, because it leaves no
duplicate behind. **A direct-to-shard hot fold** writes the authoritative image once and install
stops copying, so the slice is doing the pipeline's real work rather than amplifying it — throttling it to the staging budget would slow the
fold with no duplicate to prevent. `throttle::hot_slice_class` makes that choice per slice, from the
same flag the fold itself reads, so a drain that spans a flip is classified correctly on both sides.

Only the reclaim multiplier exceeds 1.0, so it alone bounds how far peak compaction pressure can
exceed the configured rate. Every multiplier, soft mark, and the staging backoff is runtime-tunable
(`sqlite.compaction_*_throttle_*`), so the ordering can be retuned or a caller throttled to a
standstill without a deploy.

The manager refresh charges the read axis without ever checking it: its snapshot carries no resume
cursor, so a denial would cost a full re-read and buy nothing, while the charge still makes the gated
callers yield on its behalf.

## Net shape

```
commit → DeltasAvailable → manager RefreshManager
         │
         ├─ HOT:  hot_compactor drains [hot_wm+1..H0] → manager installs → hot_watermark↑, gen++
         └─ RECLAIM (after hot install):
              reclaimer deletes dead shards / superseded+aged deltas / expired PITR
         │
         └─ Settled: ~1x live SHARD.
            In flight: + unfolded and live_owned deltas, until the drain catches up.
            History GC'd by dependency graph past PITR window.
```

## Footprint intuition

**While writes are in flight**, a database occupies up to roughly 2x its logical page size on FDB:
current SHARD data plus DELTA rows that are either above `hot_watermark` or still `live_owned`. That
is live data in transit, not dead history, and it is a *transient* peak — it belongs to the write
burst, not to the resting state.

**Once settled** the DELTA half is gone: folded deltas clear both reclaim gates and their COMMITS/VTX
rows go with them, leaving ~1x. See
[Settled state](#phase-6--settled-state-what-should-remain).

> **Do not quote "2x steady state" to explain a branch that will not drain.** Earlier revisions of
> this document described 2x as the resting footprint; that was describing the stale-PIDX defect as
> if it were the design. If a branch has no pending compaction work and is still at 2x, run the
> probes in [Settled state](#phase-6--settled-state-what-should-remain) rather than attributing it to
> a steady-state multiple.

To classify a retained delta on a live branch, sample its txids: each should be either above
`hot_watermark` (not yet folded) or `live_owned` with its pages genuinely still in `PIDX` as the
current version. A `live_owned` delta whose txid is *below* `hot_watermark` is the stale-PIDX defect
— the watermark claims those pages are folded, so nothing will ever free them.

## Failure mode note

Any loop in these workflows that calls a durable step (`ctx.activity`, `ctx.signal`,
`ctx.sleep`) must use a durable loop primitive (`ctx.loope` / `ctx.lupe` / `ctx.repeat`), never
a raw Rust `loop`/`for`. A raw loop keeps every iteration in live workflow history, which grows
unboundedly under throttle-driven retry/resume-cursor loops until the manager's history can no
longer be read in one FDB transaction and the manager wedges — which stalls *all* dispatch,
including reclaim. See `docs-internal/engine/GASOLINE/GOTCHAS.md`.

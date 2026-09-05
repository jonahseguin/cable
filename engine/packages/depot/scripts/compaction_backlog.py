#!/usr/bin/env python3
"""Estimate how much depot compaction work is outstanding, straight from FoundationDB.

Depot stores every SQLite database branch under the raw ``0x02`` subspace. Compaction is a
two-watermark drain: the hot compactor folds DELTA rows into SHARD images and advances
``CMP/root.hot_watermark_txid`` toward ``META/head.head_txid``, and the reclaimer then deletes the
DELTA and COMMITS rows the fold made redundant. When compaction has been off for a long time the
gap between those two numbers is the backlog, and the DELTA bytes sitting below the head are the
space that draining it will eventually give back.

This script reads that state directly. It never writes, and every read is a snapshot read, so it
cannot conflict with live traffic.

Every transaction also runs at batch priority. A full pass reads a point per branch across the
whole deployment, which is a large amount of read traffic to add to a cluster that is very likely
already under read pressure (that pressure is usually why someone is running this). Batch priority
is what depot's own background compaction uses, and it is what the ratekeeper sheds first, so the
diagnostic yields to production rather than competing with it. Any transaction added here must set
it too: `tr.options.set_priority_batch()` as the first statement of the body.

Two modes:

  * A single run prints the current backlog and, with ``--json out.json``, records it.
  * ``--since out.json`` compares the current state against an earlier recording and reports the
    drain rate and a projected finish time.

Usage:

    ./compaction_backlog.py --cluster-file /etc/foundationdb/fdb.cluster
    ./compaction_backlog.py -C fdb.cluster --json /tmp/backlog-1.json
    ./compaction_backlog.py -C fdb.cluster --since /tmp/backlog-1.json

Requires the ``foundationdb`` Python package matching the cluster's client library.
"""

import argparse
import datetime
import heapq
import json
import math
import random
import struct
import sys
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor

import fdb

fdb.api_version(730)

# Key layout, mirrored from engine/packages/depot/src/conveyer/keys.rs. These are raw FoundationDB
# keys: depot is not nested under a directory-layer prefix.
SQLITE_SUBSPACE_PREFIX = b"\x02"
BRANCHES_PARTITION = b"\x20"
BR_PARTITION = b"\x30"
SQLITE_CMP_DIRTY_PARTITION = b"\x75"
PAGE_SIZE = 4096

BRANCH_LIST_PREFIX = SQLITE_SUBSPACE_PREFIX + BRANCHES_PARTITION + b"/list/"
BRANCH_LIST_KEY_LEN = len(BRANCH_LIST_PREFIX) + 16
DIRTY_PREFIX = SQLITE_SUBSPACE_PREFIX + SQLITE_CMP_DIRTY_PARTITION + b"/"

# Compaction planning constants, mirrored from conveyer/quota.rs and conveyer/constants.rs. A branch
# whose lag is under the delta threshold is not a backlog: the compactor deliberately leaves it
# alone until enough commits accumulate.
COMPACTION_DELTA_THRESHOLD = 128
# Both spans are runtime-configurable (`sqlite.compaction_max_{hot,cold}_drain_span_txids`), and the
# hot span divides the headline job count, so a stale value here misreports the remaining work by
# the ratio of the two. Override the hot span with `--hot-drain-span` when the cluster sets it.
MAX_HOT_DRAIN_SPAN_TXIDS = 512
MAX_COLD_DRAIN_SPAN_TXIDS = 10_000
# The cold planner has its own, much higher trigger, and it measures its lag against the hot
# watermark rather than the head: cold publishes shard images, so it can only ever catch up to what
# the hot fold has already produced. A branch the hot fold has never touched has no shards to
# publish and therefore no cold work outstanding, however far its head has run ahead.
HOT_BURST_COLD_LAG_THRESHOLD_TXIDS = 2_048

# Bound each enumeration page and each batch of per-branch reads so no transaction approaches
# FoundationDB's five second window.
BRANCH_PAGE_SIZE = 5_000
BYTES_BATCH_SIZE = 50
DIRTY_COUNT_LIMIT = 50_000


def branch_base(branch_uuid):
    return SQLITE_SUBSPACE_PREFIX + BR_PARTITION + b"/" + branch_uuid


def admitted(branch_uuid, admission_fraction):
    """Whether the percentage-based admission gate lets this branch compact.

    Mirrors `compaction_admitted` in compaction/shared.rs exactly, including the bucket width, so
    the split reported here matches what the manager decides. The gate covers the reclaim lane as
    well as the hot lane, so an un-admitted branch retires nothing however much it is holding.
    """
    bucket = (int.from_bytes(branch_uuid, "big") % 10_000) / 10_000.0
    return bucket < admission_fraction


def strinc(prefix):
    """Smallest key greater than every key under `prefix`, for an exact prefix range."""
    stripped = prefix.rstrip(b"\xff")
    if not stripped:
        raise ValueError("prefix is entirely 0xff and has no successor")

    return stripped[:-1] + bytes([stripped[-1] + 1])


def future_bytes(future):
    """Resolve a value future to bytes, or None when the key is absent.

    The Python binding hands back a lazy `Value` proxy rather than bytes, and that proxy is not
    itself a bytes-like object, so `struct` cannot read from it directly.
    """
    return future.value if future.present() else None


def decode_db_head(payload):
    """`META/head`: vbare u16 version header, then a BARE DBHead.

    Returns the head txid and the database's current logical size in pages. The page count is what
    a fully folded branch would occupy, so summing it across the deployment gives the floor the
    depot could compact down to.
    """
    if payload is None or len(payload) < 14:
        return None

    head_txid, db_size_pages = struct.unpack_from("<QI", payload, 2)

    return (head_txid, db_size_pages)


def decode_compaction_root(payload):
    """`CMP/root`: schema_version u32, manifest_generation u64, then the two watermarks."""
    if payload is None or len(payload) < 30:
        return None

    _schema_version, _manifest_generation, hot, cold = struct.unpack_from("<IQQQ", payload, 2)

    return (hot, cold)


def decode_reclaim_progress(payload):
    """`CMP/reclaim_progress`: the reclaim drain's last recorded scan position.

    Purely diagnostic in depot itself, and the only way to tell a drain that is advancing from one
    whose cursor is pinned. Decoded defensively because it is the one row here whose BARE layout has
    variable-width fields.
    """
    if payload is None or len(payload) < 33:
        return None

    try:
        _schema, _generation, commit_scan_cursor = struct.unpack_from("<IQQ", payload, 2)
        offset = 2 + 4 + 8 + 8
        commit_scan_complete = payload[offset] != 0
        offset += 1
        # Option<(u32, u64)> cold cursor: a presence byte, then the tuple when present.
        offset += 1 + 4 + 8 if payload[offset] != 0 else 1
        # The outcome enum is a BARE uint (varint).
        while payload[offset] & 0x80:
            offset += 1
        offset += 1
        updated_at_ms = struct.unpack_from("<q", payload, offset)[0]
    except (IndexError, struct.error):
        return None

    return {
        "commit_scan_cursor": commit_scan_cursor,
        "commit_scan_complete": commit_scan_complete,
        "updated_at_ms": updated_at_ms,
    }


@fdb.transactional
def read_branch_page(tr, begin, end):
    tr.options.set_priority_batch()
    return [kv.key for kv in tr.snapshot.get_range(begin, end, limit=BRANCH_PAGE_SIZE)]


def iter_branch_ids(db):
    """Yield every database branch id from the branch-record index, a page at a time.

    The index holds one small row per branch plus a handful of sibling rows (refcount, pins), so
    this walks a few rows per branch rather than any part of the page data. Paged across
    transactions because a deployment can hold far more branches than one transaction may read,
    which also means a branch created mid-walk may be missed. That is fine for a backlog estimate.
    """
    cursor = BRANCH_LIST_PREFIX
    end = strinc(BRANCH_LIST_PREFIX)

    while True:
        page = read_branch_page(db, cursor, end)
        if not page:
            return

        for key in page:
            if len(key) == BRANCH_LIST_KEY_LEN:
                yield key[len(BRANCH_LIST_PREFIX) :]

        cursor = page[-1] + b"\x00"


def iter_batches(items, size):
    batch = []
    for item in items:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch = []

    if batch:
        yield batch


@fdb.transactional
def read_lag_batch(tr, branch_ids):
    """Read the two watermarks that define the backlog, for a batch of branches.

    Deliberately only two point reads per branch. This pass runs over every branch in the
    deployment, so anything else it did would be multiplied by hundreds of thousands: the byte
    accounting is sampled separately rather than charged to every branch here.

    Every read is issued before any is resolved, so the batch costs one round trip rather than one
    per branch. Results are plain tuples because a dict per branch is a real memory cost at this
    count.
    """
    tr.options.set_priority_batch()
    pending = [
        (
            branch_id,
            tr.snapshot.get(branch_base(branch_id) + b"/META/head"),
            tr.snapshot.get(branch_base(branch_id) + b"/CMP/root"),
        )
        for branch_id in branch_ids
    ]

    results = []
    for branch_id, head_f, root_f in pending:
        head = decode_db_head(future_bytes(head_f))
        if head is None:
            # A branch record with no head has no page data to compact. Destroyed branches sit here
            # until their record is collected.
            results.append((branch_id, None, 0, 0, 0))
            continue

        head_txid, db_size_pages = head
        root = decode_compaction_root(future_bytes(root_f))
        results.append(
            (branch_id, head_txid, root[0] if root else 0, root[1] if root else 0, db_size_pages)
        )

    return results


@fdb.transactional
def read_bytes_batch(tr, branch_ids):
    """Size the row families of a batch of branches.

    The figures come from `get_estimated_range_size_bytes`, which samples the storage servers
    instead of scanning: it is free no matter how much data a branch holds, which is the only way to
    size exactly the branches this exists to measure. It is still a round trip per range, which is
    why only a sample of branches and the worst offenders are measured this way.
    """
    tr.options.set_priority_batch()
    pending = []
    for branch_id in branch_ids:
        base = branch_base(branch_id)
        ranges = [base, base + b"/DELTA/", base + b"/SHARD/", base + b"/COMMITS/"]
        pending.append(
            (
                branch_id,
                [tr.get_estimated_range_size_bytes(r, strinc(r)) for r in ranges],
            )
        )

    return {
        branch_id: tuple(int(future.wait()) for future in futures)
        for branch_id, futures in pending
    }


@fdb.transactional
def read_pidx_repair(tr, branch_ids):
    """Which branches have completed the stale-PIDX repair walk.

    A fold that leaves a page's `PIDX` row pointing at its old `DELTA` owner strands that delta:
    reclaim correctly refuses to delete the authoritative source for a live page, and hot staging's
    owner window can never revisit a txid below the watermark. The repair sweep walks the branch's
    whole PIDX prefix once and clears such rows, releasing those deltas. Its completion marker is
    the cheap way to tell whether a branch's folded history can drain at all.
    """
    tr.options.set_priority_batch()
    futures = [
        (branch_id, tr.snapshot.get(branch_base(branch_id) + b"/CMP/pidx_repair"))
        for branch_id in branch_ids
    ]

    return {branch_id: future_bytes(future) is not None for branch_id, future in futures}


@fdb.transactional
def read_reclaim_progress(tr, branch_ids):
    tr.options.set_priority_batch()
    futures = [
        (branch_id, tr.snapshot.get(branch_base(branch_id) + b"/CMP/reclaim_progress"))
        for branch_id in branch_ids
    ]

    return {
        branch_id: decode_reclaim_progress(future_bytes(future)) for branch_id, future in futures
    }


@fdb.transactional
def read_depot_bytes(tr):
    """Exact-enough size of the whole depot subspace, without scanning it."""
    tr.options.set_priority_batch()
    return int(
        tr.get_estimated_range_size_bytes(
            SQLITE_SUBSPACE_PREFIX, strinc(SQLITE_SUBSPACE_PREFIX)
        ).wait()
    )


@fdb.transactional
def read_dirty_count(tr):
    """How many branches carry a compaction dirty marker right now.

    Its own transaction, separate from the size estimate. Sharing one meant the scan spent the
    window and the estimate's `wait()` then failed the whole transaction on a loaded cluster, which
    is exactly when this is worth running.
    """
    tr.options.set_priority_batch()
    # Bounded so the count cannot run the transaction out of its window. The dirty markers are a
    # work queue, not a backlog measure, so a truncated count still answers what it is for.
    dirty = list(tr.snapshot.get_range(DIRTY_PREFIX, strinc(DIRTY_PREFIX), limit=DIRTY_COUNT_LIMIT))
    return len(dirty)


def read_globals(db):
    """Whole-subspace figures that do not need per-branch attribution.

    Each figure is optional: a loaded cluster can time these out, and losing one of them is not
    worth discarding a branch walk that takes several minutes. A missing figure is reported as
    absent rather than as zero, so it cannot be mistaken for a real reading.
    """
    globals_ = {"depot_bytes": None, "dirty_branches": None, "dirty_branches_truncated": False}
    try:
        globals_["depot_bytes"] = read_depot_bytes(db)
    except fdb.FDBError as error:
        print(f"  warning: depot size estimate failed ({error.description}), continuing without it")
    try:
        count = read_dirty_count(db)
        globals_["dirty_branches"] = count
        globals_["dirty_branches_truncated"] = count == DIRTY_COUNT_LIMIT
    except fdb.FDBError as error:
        print(f"  warning: dirty branch count failed ({error.description}), continuing without it")
    return globals_


class BacklogAggregator:
    """Folds per-branch readings into totals, retaining only bounded samples.

    An operator pod is small and a large deployment holds far more branches than fit in it, so
    nothing here may accumulate a record per branch. Every figure below is a running total, and the
    only branch ids kept are the top-N heap the report lists and a reservoir sample for the byte
    accounting.
    """

    def __init__(self, keep_top, byte_sample, admission_fraction, hot_drain_span):
        self.keep_top = keep_top
        self.byte_sample = byte_sample
        self.admission_fraction = admission_fraction
        self.hot_drain_span = hot_drain_span
        self.worst = []
        self.folded_sample = []
        self.unfolded_sample = []
        self.folded_branches = 0
        self.unfolded_branches = 0
        # Backlog on the un-admitted side of the gate. This is work the drain is not merely behind
        # on but is forbidden from starting, so it does not move until the percent is raised.
        self.blocked_branches = 0
        self.blocked_hot_lag_txids = 0
        self.blocked_logical_bytes = 0
        # Live bytes of the folded stratum, the denominator for the SHARD redundancy ratio. A
        # settled branch holds one image per shard, so folded shard bytes well above folded live
        # bytes are superseded versions the dead-shard sweep has not collected.
        self.folded_logical_bytes = 0
        self.sequence = 0
        self.branch_records = 0
        self.live_branches = 0
        self.backlogged_branches = 0
        self.never_compacted_branches = 0
        self.hot_lag_txids = 0
        self.hot_jobs_remaining = 0
        self.cold_lag_txids = 0
        self.cold_jobs_remaining = 0
        self.cold_backlogged_branches = 0
        self.logical_bytes = 0
        self.cold_tier_in_use = False

    def add(self, reading):
        branch_id, head_txid, hot_watermark, cold_watermark, db_size_pages = reading
        self.branch_records += 1
        if head_txid is None:
            return

        self.live_branches += 1
        self.logical_bytes += db_size_pages * PAGE_SIZE
        if cold_watermark > 0:
            self.cold_tier_in_use = True

        # Stratified by whether the branch has ever folded. SHARD rows exist only on the folded
        # side, which is a small minority of branches, so one uniform sample spends almost all of
        # itself on branches that contribute no shard bytes at all and the shard estimate swings
        # wildly between runs. Sampling each stratum separately and weighting by its population
        # puts the whole shard sample where the shards actually are.
        if hot_watermark == 0:
            self.never_compacted_branches += 1
            self.unfolded_branches += 1
            self.reservoir(self.unfolded_sample, branch_id, self.unfolded_branches)
        else:
            self.folded_branches += 1
            self.folded_logical_bytes += db_size_pages * PAGE_SIZE
            self.reservoir(self.folded_sample, branch_id, self.folded_branches)

        hot_lag = max(0, head_txid - hot_watermark)
        if hot_lag >= COMPACTION_DELTA_THRESHOLD:
            self.backlogged_branches += 1
            self.hot_lag_txids += hot_lag
            self.hot_jobs_remaining += math.ceil(hot_lag / self.hot_drain_span)
            self.offer(branch_id, hot_lag, head_txid, hot_watermark)
            if not admitted(branch_id, self.admission_fraction):
                self.blocked_branches += 1
                self.blocked_hot_lag_txids += hot_lag
                self.blocked_logical_bytes += db_size_pages * PAGE_SIZE

        cold_lag = max(0, hot_watermark - cold_watermark)
        if cold_lag >= HOT_BURST_COLD_LAG_THRESHOLD_TXIDS:
            self.cold_backlogged_branches += 1
            self.cold_lag_txids += cold_lag
            self.cold_jobs_remaining += math.ceil(cold_lag / MAX_COLD_DRAIN_SPAN_TXIDS)

    def offer(self, branch_id, hot_lag, head_txid, hot_watermark):
        # The sequence number keeps the heap from ever comparing two branch ids on a lag tie.
        self.sequence += 1
        entry = (hot_lag, self.sequence, branch_id, head_txid, hot_watermark)
        if len(self.worst) < self.keep_top:
            heapq.heappush(self.worst, entry)
        else:
            heapq.heappushpop(self.worst, entry)

    def reservoir(self, sample, branch_id, seen):
        """Uniform sample of one stratum, for the byte accounting.

        Reservoir sampling because the branch count is not known until the walk finishes, and
        sampling the first N branches instead would sample by branch id, which is not random with
        respect to anything but is not uniform either.
        """
        if len(sample) < self.byte_sample:
            sample.append(branch_id)
            return

        index = random.randrange(seen)
        if index < self.byte_sample:
            sample[index] = branch_id


def measure_bytes(db, branch_ids, concurrency):
    """Sum the row-family sizes of a bounded set of branches."""
    totals = {}
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        for batch in pool.map(
            lambda ids: read_bytes_batch(db, ids),
            list(iter_batches(branch_ids, BYTES_BATCH_SIZE)),
        ):
            totals.update(batch)

    return totals


def collect(db, args):
    started_at = time.time()
    aggregator = BacklogAggregator(
        max(args.top, 20),
        args.byte_sample,
        min(max(args.admission_percent / 100.0, 0.0), 1.0),
        max(args.hot_drain_span, 1),
    )
    # Read the whole-subspace figures before the walk rather than after it. They are two cheap
    # transactions against slow-moving aggregates, and taking them first means a failure here costs
    # seconds instead of discarding a branch walk that runs for several minutes.
    globals_ = read_globals(db)
    batches = iter_batches(iter_branch_ids(db), args.batch_size)

    # Each batch is folded in and dropped as it lands, and only `concurrency * 2` batches are ever
    # in flight, so peak memory is set by the concurrency rather than by the size of the deployment.
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        in_flight = deque()
        for batch in batches:
            in_flight.append(pool.submit(read_lag_batch, db, batch))
            while len(in_flight) >= args.concurrency * 2:
                drain_one(in_flight, aggregator, started_at, args.batch_size)

        while in_flight:
            drain_one(in_flight, aggregator, started_at, args.batch_size)

    sampled = len(aggregator.folded_sample) + len(aggregator.unfolded_sample)
    log(f"sizing {sampled:,} sampled branches", started_at)
    sample_bytes = {
        "folded": measure_bytes(db, aggregator.folded_sample, args.concurrency),
        "unfolded": measure_bytes(db, aggregator.unfolded_sample, args.concurrency),
    }
    # Only folded branches can hold a stale row, so the unfolded stratum is not worth asking.
    repaired = {}
    for batch in iter_batches(aggregator.folded_sample, BYTES_BATCH_SIZE):
        repaired.update(read_pidx_repair(db, batch))

    # Reclaim coverage over the folded stratum. Folding only makes history eligible for deletion;
    # the reclaimer is what deletes it, and it runs as a separate job the manager has to dispatch.
    # A branch with no `CMP/reclaim_progress` row has never completed a reclaim pass, so everything
    # its folds made redundant is still resident. Read over the uniform folded sample rather than
    # the worst-by-lag branches: those are ranked by *unfolded* history, which selects against the
    # branches this is meant to find (fully folded, never reclaimed).
    folded_progress = {}
    for batch in iter_batches(aggregator.folded_sample, BYTES_BATCH_SIZE):
        folded_progress.update(read_reclaim_progress(db, batch))

    worst_ids = [entry[2] for entry in aggregator.worst]
    worst_bytes = measure_bytes(db, worst_ids, args.concurrency)
    worst_progress = {}
    for batch in iter_batches(worst_ids, BYTES_BATCH_SIZE):
        worst_progress.update(read_reclaim_progress(db, batch))

    return build_report(
        aggregator,
        globals_,
        sample_bytes,
        worst_bytes,
        worst_progress,
        repaired,
        folded_progress,
        started_at,
    )


def drain_one(in_flight, aggregator, started_at, batch_size):
    for reading in in_flight.popleft().result():
        aggregator.add(reading)

    if aggregator.branch_records % 100_000 < batch_size:
        log(f"read {aggregator.branch_records:,} branches", started_at)


def log(message, started_at):
    print(f"[{time.time() - started_at:6.0f}s] {message}", file=sys.stderr, flush=True)


def build_report(
    aggregator,
    globals_,
    sample_bytes,
    worst_bytes,
    worst_progress,
    repaired,
    folded_progress,
    started_at,
):
    # A deployment with no cold tier configured never advances a cold watermark, so every branch
    # reads as maximally cold-lagged. That is not a backlog, it is a tier that does not exist, and
    # reporting it as work outstanding would be the most misleading number here.
    cold_in_use = aggregator.cold_tier_in_use

    # Estimate each family by scaling each stratum's sample mean up to that stratum's population,
    # then convert to shares. The subspace total is exact and the sample is not, so the shares are
    # applied to the exact total rather than reported as absolute bytes: that keeps the three
    # families summing to something real even when the sample under- or over-shoots.
    strata = [
        (sample_bytes["folded"], aggregator.folded_branches),
        (sample_bytes["unfolded"], aggregator.unfolded_branches),
    ]
    scaled = [0.0, 0.0, 0.0, 0.0]
    for rows, population in strata:
        if not rows:
            continue
        for family in range(4):
            scaled[family] += sum(row[family] for row in rows.values()) / len(rows) * population

    shares = {"delta": 0.0, "shard": 0.0, "commits": 0.0}
    if scaled[0] > 0:
        shares = {
            "delta": scaled[1] / scaled[0],
            "shard": scaled[2] / scaled[0],
            "commits": scaled[3] / scaled[0],
        }

    # `scaled[0]` is the same total built from the stratified sample, so it stands in when the
    # whole-subspace estimate could not be read. It is a weaker number and is flagged as such, but
    # it keeps every downstream figure computable instead of losing the run.
    depot_bytes = globals_["depot_bytes"]
    depot_bytes_sampled = depot_bytes is None
    if depot_bytes_sampled:
        depot_bytes = int(scaled[0])
    branches = []
    for hot_lag, _sequence, branch_id, head_txid, hot_watermark in sorted(
        aggregator.worst, reverse=True
    ):
        sizes = worst_bytes.get(branch_id, (0, 0, 0, 0))
        branches.append(
            {
                "branch_id": branch_id.hex(),
                "head_txid": head_txid,
                "hot_watermark_txid": hot_watermark,
                "hot_lag_txids": hot_lag,
                "total_bytes": sizes[0],
                "delta_bytes": sizes[1],
                "shard_bytes": sizes[2],
                "commits_bytes": sizes[3],
                "reclaim_progress": worst_progress.get(branch_id),
            }
        )

    return {
        "schema": 2,
        "collected_at_ms": int(started_at * 1000),
        "collection_duration_s": round(time.time() - started_at, 1),
        "depot_bytes": depot_bytes,
        "depot_bytes_sampled": depot_bytes_sampled,
        # What the page data actually amounts to once every branch is folded to a single image per
        # page. The gap between this and the subspace total is redundancy: superseded page versions
        # still sitting in DELTA, plus retained COMMITS history and index rows. It is the ceiling on
        # what compaction plus reclaim can hand back, not a promise.
        "logical_bytes": aggregator.logical_bytes,
        "byte_sample_branches": len(sample_bytes["folded"]) + len(sample_bytes["unfolded"]),
        "byte_sample_folded_branches": len(sample_bytes["folded"]),
        "folded_branches": aggregator.folded_branches,
        "pidx_repair_sampled": len(repaired),
        "pidx_repair_swept": sum(1 for done in repaired.values() if done),
        # Folding makes history deletable; only the reclaimer deletes it. Tracked over the folded
        # sample, so this is the fraction of folded branches that have ever completed a reclaim
        # pass. It is the drain's real progress signal: hot lag can fall while nothing is freed.
        "reclaim_sampled": len(folded_progress),
        "reclaim_started": sum(1 for progress in folded_progress.values() if progress is not None),
        "folded_logical_bytes": aggregator.folded_logical_bytes,
        "admission_fraction": aggregator.admission_fraction,
        "hot_drain_span_txids": aggregator.hot_drain_span,
        "admission_blocked_branches": aggregator.blocked_branches,
        "admission_blocked_hot_lag_txids": aggregator.blocked_hot_lag_txids,
        "admission_blocked_logical_bytes": aggregator.blocked_logical_bytes,
        "delta_bytes": int(depot_bytes * shares["delta"]),
        "shard_bytes": int(depot_bytes * shares["shard"]),
        "commits_bytes": int(depot_bytes * shares["commits"]),
        "dirty_branches": globals_["dirty_branches"],
        "dirty_branches_truncated": globals_["dirty_branches_truncated"],
        "branch_records": aggregator.branch_records,
        "live_branches": aggregator.live_branches,
        "backlogged_branches": aggregator.backlogged_branches,
        "never_compacted_branches": aggregator.never_compacted_branches,
        "hot_lag_txids": aggregator.hot_lag_txids,
        # One hot job drains at most MAX_HOT_DRAIN_SPAN_TXIDS, and the manager plans one window per
        # branch per refresh, so this counts the bounded jobs the drain still has to run.
        "hot_jobs_remaining": aggregator.hot_jobs_remaining,
        "cold_tier_in_use": cold_in_use,
        "cold_lag_txids": aggregator.cold_lag_txids if cold_in_use else 0,
        "cold_jobs_remaining": aggregator.cold_jobs_remaining if cold_in_use else 0,
        "cold_backlogged_branches": aggregator.cold_backlogged_branches if cold_in_use else 0,
        "branches": branches,
    }


def human_bytes(value):
    units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
    size = float(value)
    for unit in units:
        if abs(size) < 1024 or unit == units[-1]:
            return f"{size:,.1f} {unit}"
        size /= 1024


def print_report(report, top):
    print("depot compaction backlog")
    print(f"  collected in {report['collection_duration_s']}s")
    print()
    print("footprint")
    print(f"  depot subspace total   {human_bytes(report['depot_bytes'])}")
    print(f"  DELTA (unfolded pages) {human_bytes(report['delta_bytes'])}")
    print(f"  SHARD (folded images)  {human_bytes(report['shard_bytes'])}")
    print(f"  COMMITS (history)      {human_bytes(report['commits_bytes'])}")
    if report.get("depot_bytes_sampled"):
        print(
            f"  (the whole-subspace estimate could not be read, so the total is itself scaled from "
            f"{report['byte_sample_branches']:,} sampled branches, "
            f"{report['byte_sample_folded_branches']:,} of them folded. Treat it as approximate)"
        )
    else:
        print(
            f"  (the total is exact; the split is estimated from {report['byte_sample_branches']:,} "
            f"sampled branches, {report['byte_sample_folded_branches']:,} of them folded)"
        )
    print()
    print("recoverable")
    logical = report["logical_bytes"]
    print(f"  live page data         {human_bytes(logical)} (sum of every branch's current size)")
    if logical > 0:
        headroom = report["depot_bytes"] - logical
        print(f"  redundancy             {report['depot_bytes'] / logical:.1f}x live data")
        print(f"  upper bound to reclaim {human_bytes(headroom)}")
    if report["pidx_repair_sampled"]:
        swept = report["pidx_repair_swept"]
        sampled = report["pidx_repair_sampled"]
        print(
            f"  stale-PIDX repair      {swept:,}/{sampled:,} sampled folded branches swept"
            f" ({swept / sampled * 100:.0f}%)"
        )
    if report.get("reclaim_sampled"):
        started = report["reclaim_started"]
        sampled = report["reclaim_sampled"]
        print(
            f"  reclaim coverage       {started:,}/{sampled:,} sampled folded branches have"
            f" reclaimed ({started / sampled * 100:.0f}%)"
        )
    folded_live = report.get("folded_logical_bytes") or 0
    if folded_live > 0:
        folded_shards = report["shard_bytes"]
        print(
            f"  SHARD vs folded live   {folded_shards / folded_live:.1f}x"
            f" ({human_bytes(folded_shards)} over {human_bytes(folded_live)})"
        )
    print()
    print("branches")
    print(f"  branch records         {report['branch_records']:,}")
    print(f"  live (have page data)  {report['live_branches']:,}")
    print(f"  backlogged             {report['backlogged_branches']:,}")
    print(f"  never folded           {report['never_compacted_branches']:,}")
    # Most branches in a real deployment are small and short-lived and never accumulate the 128
    # commits the fold waits for. Their pages sit in DELTA forever by design, so a large DELTA share
    # is not by itself evidence of compaction debt. This line separates the two readings.
    below = report["live_branches"] - report["backlogged_branches"]
    print(f"  below fold threshold   {below:,} (under {COMPACTION_DELTA_THRESHOLD} txids, never folds)")
    if report["dirty_branches"] is None:
        print("  flagged dirty now      unavailable (count timed out)")
    else:
        dirty_suffix = "+" if report["dirty_branches_truncated"] else ""
        print(f"  flagged dirty now      {report['dirty_branches']:,}{dirty_suffix}")
    print()
    print("work outstanding")
    print(f"  hot lag                {report['hot_lag_txids']:,} txids")
    span = report.get("hot_drain_span_txids", MAX_HOT_DRAIN_SPAN_TXIDS)
    print(f"  hot jobs remaining     {report['hot_jobs_remaining']:,} (at {span:,} txids per job)")
    fraction = report.get("admission_fraction")
    if fraction is not None and fraction < 1.0:
        blocked = report["admission_blocked_branches"]
        backlogged = report["backlogged_branches"]
        share = blocked / backlogged * 100 if backlogged else 0.0
        print(
            f"  admission-blocked      {blocked:,} of {backlogged:,} backlogged branches"
            f" ({share:.0f}%) at {fraction * 100:g}%"
        )
        print(
            f"                         holding {report['admission_blocked_hot_lag_txids']:,} txids"
            f" of lag over {human_bytes(report['admission_blocked_logical_bytes'])} of live data"
        )
    if report["cold_tier_in_use"]:
        print(
            f"  cold lag               {report['cold_lag_txids']:,} txids"
            f" over {report['cold_backlogged_branches']:,} branches"
        )
        print(f"  cold jobs remaining    {report['cold_jobs_remaining']:,}")
    else:
        print("  cold lag               n/a (no cold tier in use)")

    if top:
        print()
        print(f"top {top} branches by hot lag")
        print(f"  {'branch_id':<34}{'hot lag':>14}{'delta':>14}{'shard':>14}")
        for branch in report["branches"][:top]:
            print(
                f"  {branch['branch_id']:<34}"
                f"{branch['hot_lag_txids']:>14,}"
                f"{human_bytes(branch['delta_bytes']):>14}"
                f"{human_bytes(branch['shard_bytes']):>14}"
            )


def print_progress(previous, current):
    elapsed_s = (current["collected_at_ms"] - previous["collected_at_ms"]) / 1000
    if elapsed_s <= 0:
        print("the recorded snapshot is not older than this run, so there is no interval to measure")
        return

    drained_txids = previous["hot_lag_txids"] - current["hot_lag_txids"]
    freed_bytes = previous["depot_bytes"] - current["depot_bytes"]
    elapsed_h = elapsed_s / 3600

    print()
    print(f"progress over {elapsed_h:,.2f}h since the recorded snapshot")
    print(f"  hot lag        {previous['hot_lag_txids']:,} -> {current['hot_lag_txids']:,} txids")
    print(
        f"  depot bytes    {human_bytes(previous['depot_bytes'])} -> "
        f"{human_bytes(current['depot_bytes'])}"
    )
    print(f"  drain rate     {drained_txids / elapsed_h:,.0f} txids/h")
    print(f"  reclaim rate   {human_bytes(freed_bytes / elapsed_h)}/h")

    if drained_txids <= 0:
        print()
        print("  the backlog did not shrink over this interval")
        return

    remaining_h = current["hot_lag_txids"] / (drained_txids / elapsed_h)
    finish = datetime.datetime.now() + datetime.timedelta(hours=remaining_h)
    print(
        f"  projected done {remaining_h:,.1f}h from now ({finish:%Y-%m-%d %H:%M},"
        " extrapolated from one interval)"
    )


def main():
    parser = argparse.ArgumentParser(
        description="Estimate outstanding depot compaction work from FoundationDB.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "-C",
        "--cluster-file",
        default=None,
        help="path to the FoundationDB cluster file (defaults to the client library's own lookup)",
    )
    # Both mirror runtime config the cluster may have moved off its default. The admission percent
    # gates the reclaim lane as well as the hot lane, and the drain span divides the job count, so a
    # stale value here changes the headline numbers rather than a detail.
    parser.add_argument(
        "--admission-percent",
        type=float,
        default=100.0,
        help=(
            "sqlite.compaction_admission_percent in effect, to split the backlog by whether a "
            "branch is allowed to compact at all (default: 100)"
        ),
    )
    parser.add_argument(
        "--hot-drain-span",
        type=int,
        default=MAX_HOT_DRAIN_SPAN_TXIDS,
        help=(
            "sqlite.compaction_max_hot_drain_span_txids in effect, the txids one hot job drains "
            f"(default: {MAX_HOT_DRAIN_SPAN_TXIDS})"
        ),
    )
    # The defaults are sized for a small operator pod. Every read in a batch is in flight at once,
    # so `concurrency * batch_size` reads are outstanding at the peak, and a client with too little
    # CPU to drain them fails the whole transaction on its timeout rather than merely running slow.
    # Raise both on a roomier host to cut the wall time.
    parser.add_argument(
        "--concurrency",
        type=int,
        default=8,
        help="how many read batches to run at once (default: 8)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=200,
        help="how many branches to read per transaction (default: 200)",
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=60_000,
        help="per-transaction timeout (default: 60000)",
    )
    parser.add_argument(
        "--byte-sample",
        type=int,
        default=2_000,
        help="how many branches to size for the DELTA/SHARD/COMMITS split (default: 2000)",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=20,
        help="how many of the worst branches to list, 0 to omit the list (default: 20)",
    )
    parser.add_argument(
        "--json",
        metavar="PATH",
        default=None,
        help="write the full report as JSON, for comparing against a later run with --since",
    )
    parser.add_argument(
        "--since",
        metavar="PATH",
        default=None,
        help="a JSON report from an earlier run, to report the drain rate and a projected finish",
    )
    args = parser.parse_args()

    previous = None
    if args.since:
        with open(args.since) as handle:
            previous = json.load(handle)

    db = fdb.open(args.cluster_file)
    db.options.set_transaction_timeout(args.timeout_ms)
    db.options.set_transaction_retry_limit(10)

    report = collect(db, args)
    print_report(report, args.top)

    if previous:
        print_progress(previous, report)

    if args.json:
        with open(args.json, "w") as handle:
            json.dump(report, handle, indent=2)
        print()
        print(f"wrote {args.json}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

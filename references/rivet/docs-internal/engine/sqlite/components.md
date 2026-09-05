# SQLite Storage Components

Depot is split into the conveyer hot path plus workflow compaction. Workflow compaction is the only compaction publish/delete authority.

## Conveyer

The conveyer is the request path used by the SQLite VFS.

Responsibilities:

- Resolve bucket/database branch ancestry for reads.
- Commit dirty pages as LTX DELTA chunks under `BR/{database_id}/DELTA/{txid}/{chunk}`.
- Write PIDX owner rows for dirty pages.
- Write `COMMITS/{txid}` and `VTX/{versionstamp}` in the same commit transaction.
- Maintain `META/head`, quota counters, and access-touch manifest fields.
- Update `SQLITE_CMP_DIRTY/{database_branch_id}` and send throttled `DeltasAvailable` workflow wakeups when hot lag crosses compaction thresholds.
- Create buckets, create databases, fork buckets, fork databases, and write branch records/catalog markers.
- Create and resolve restore points. Pinned restore points write FDB pins directly and start as `PinStatus::Ready`.

Lease ownership: none. Correctness relies on Pegboard single-writer exclusivity for a live database plus FDB transaction fences. The conveyer must not take compactor leases.

## Workflow Compaction

The workflow compaction path uses one persistent DB manager plus hot and reclaim companion workflows per database branch.

Responsibilities:

- Coalesce commit wakeups through `SQLITE_CMP_DIRTY/{database_branch_id}` and `DeltasAvailable` signals.
- Plan hot jobs from current FDB state instead of trusting signal payloads.
- Cap each hot job's drain to `MAX_HOT_DRAIN_SPAN_TXIDS` past the hot watermark (raised to the first fold when it sits past the window). A large backlog, such as one accumulated while compaction was disabled, catches up incrementally across manager refresh cycles instead of one unbounded drain.
- Carry the branch lifecycle generation through planned jobs and reject stale stage, publish, or reclaim work after branch deletion or recreation.
- Have the hot companion write staged shard blobs under `CMP/stage/{job_id}/hot_shard`.
- Install matching hot job output by copying staged blobs to reader-visible `SHARD`, advancing `CMP/root`, and compare-and-clearing expected PIDX rows. The install activity returns a resume cursor once `CMP_BULK_ACTIVITY_EARLY_TIMEOUT` elapses and the manager re-dispatches from it, so slow FDB transactions shrink each activity call instead of racing the hard activity timeout.
- Have the reclaimer delete only manager-authorized FDB rows and staged output.
- Reclaim a folded `DELTA/{txid}/*` (no live PIDX entry owns its pages) only when the shard-materialization gate passes: for the smallest coverage fold at or above the txid, every shard the delta touched has a materialized version in `[txid, fold]` (read from the C1 fold index). The freed DELTA bytes are credited back to `META/quota`.
- Reclaim a non-fold commit's `COMMITS/{txid}` + `VTX/{vs}` only at or below the delete bound, which is `min(pin txids, unexpired PITR rep txids) - 1` (falling back to the hot watermark when there is no pin). COMMITS/VTX are not billable keys, so their deletion takes no quota credit.
- Budget every reclaim slice's delete candidates (expired PITR interval rows, shard-cache demotes, dead shard versions, commits/deltas) by key count and value bytes against one shared `CompactionBatchBudget`, because each lane's `COMPARE_AND_CLEAR` carries the compared value into the single slice transaction. The plan and delete paths consume the budget in the same deterministic order so both derive identical sets, and capped tails drain across later slices.
- Keep automatic PITR interval coverage and retained restore point pins live until reclaim can prove they are no longer needed.
- Stop the manager and companion workflows through `DestroyDatabaseBranch` when a database branch is no longer live.

Lease ownership: none. Gasoline workflow uniqueness uses only the database branch id tag.

## Ownership Summary

| Component | Main writes | Lease |
|---|---|---|
| Conveyer | `META/head`, `COMMITS`, `VTX`, `PIDX`, `DELTA`, branch records, restore points | None |
| Workflow DB manager | `CMP/root`, live `SHARD`, `PITR_INTERVAL`, matching PIDX clears | None |
| Workflow companions | Staged hot output, manager-authorized deletes and cleanup | None |

The components share branch metadata and pin counters, but each mutable manifest field has one owner.

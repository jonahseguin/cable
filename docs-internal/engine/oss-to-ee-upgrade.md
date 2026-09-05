# Upgrading a cluster from OSS to EE

EE is a superset of OSS at the storage layer but not at the workflow layer. A cluster can be moved
from an OSS build to an EE build, but compaction workflows have to be drained first. There is no
supported path in the other direction: assume a downgrade is a restore from backup.

## Stored data is compatible

UDB rows written by OSS are readable by EE and vice versa. The cold storage subsystem is
Enterprise-only, but OSS keeps its row schema rather than deleting it:

- The cold key builders in `depot/src/conveyer/keys.rs`.
- The row codecs in `depot/src/conveyer/types/compaction.rs`: `encode_cold_shard_ref`,
  `decode_cold_shard_ref`, `encode_retired_cold_object`, `decode_retired_cold_object`.
- `cold_watermark_txid` and `cold_watermark_versionstamp` on the compaction root, which
  `decode_compaction_root` still reads.

An OSS cluster simply never writes cold rows, so an EE build reading OSS storage finds an empty cold
tier rather than a missing one. Do not delete these as dead code in OSS. They read as unused, and
removing them is what would make this upgrade path fail.

## In-flight compaction workflows do not survive

Gasoline replays a workflow from its recorded history and raises an unrecoverable
`WorkflowError::HistoryDiverged` when the replayed path branches from what was recorded. EE's
compaction workflows take durable steps that OSS's do not, so a workflow that is mid-flight when the
binary changes will diverge:

- `db_manager` dispatches three companion workflows on EE (hot, cold, reclaim) and two on OSS. The
  extra `ctx.workflow(...).dispatch()` is a recorded step, and `CompanionWorkflowIds` carries a
  third id on EE.
- `db_reclaimer` runs a cold-object lane on EE that OSS does not: an activity chain plus a
  `ctx.sleep_until(delete_after_ms)` for the delete grace period, all recorded steps.

This affects one manager and one reclaimer workflow per database branch, so a cluster with many
branches will see many wedged workflows rather than one.

## Upgrade procedure

1. Stop actor traffic, or at least stop writes heavy enough to keep triggering compaction.
2. Let compaction drain, or force the running compaction workflows to completion. A manager or
   reclaimer sitting idle between jobs is safe to cut over; one mid-job is not.
3. Confirm no compaction workflows are running before swapping the binary.
4. Deploy the EE build. New manager workflows dispatch all three companions from the start.
5. Configure `sqlite.workflow_cold_storage` if cold storage is wanted. Without it EE behaves like
   OSS: hot tier only, and the cold watermark stays at zero.

If a workflow is wedged after the fact it shows up as `HistoryDiverged` in the workflow error, and
the fix is to reset that workflow rather than to retry it.

## Config differences

Both editions set `deny_unknown_fields`, on `Root` and on the config blocks under it, so neither
silently ignores a key it does not recognize.

An OSS config loads on EE. EE's config is a superset, and every EE-only key is an `Option` with
`#[serde(default)]`, so a config that omits them deserializes with those blocks absent. Nothing in
the file is unknown to EE.

An EE config does not load on OSS. Keys such as `kafka`, `compute_gateway`, `metadata`, and
`sqlite.workflow_cold_storage` do not exist in OSS's structs, and `deny_unknown_fields` rejects them
rather than skipping them. This is one more reason a downgrade is a restore rather than a redeploy.
The EE-only blocks are listed under "EE-Only Surface" in the root `CLAUDE.md`.

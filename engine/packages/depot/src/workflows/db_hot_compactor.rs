use std::time::Instant;

use rivet_config::config::DEPOT_COMPACTION_THROTTLE;
use universaldb::prelude::*;

use crate::compaction::{
	companion::{CompanionKind, run_companion_loop},
	shared::*,
	*,
};
use crate::metrics;
use crate::workflows::db_manager::branch_record_is_live_at_generation;

#[cfg(feature = "test-faults")]
use crate::compaction::test_hooks;
#[cfg(feature = "test-faults")]
use crate::fault::{DepotFaultAction, HotCompactionFaultPoint};

#[workflow(DbHotCompactorWorkflow)]
pub async fn depot_db_hot_compactor3(
	ctx: &mut WorkflowCtx,
	input: &DbHotCompactorInput,
) -> Result<()> {
	run_companion_loop(ctx, input.database_branch_id, CompanionKind::Hot).await
}

/// Plans and stages one hot slice starting at the drain cursor. The slice's head and PITR clock are
/// pinned to the drain-start `(H0, T0)` so every slice the companion accumulates binds the same
/// fingerprint inputs and the manager can bulk-install them at the end.
///
/// One planning transaction reads the slice's fold inputs, then a loop of bounded write transactions
/// stages the folded shard images while the decoded inputs stay in local activity memory. Staging
/// writes a complete image per `(coverage txid, touched shard)` pair, so its write volume scales with
/// how widely the slice's pages scatter across shards rather than with the bytes the input read budget
/// admitted: a wide slice, or even a single wide commit, does not fit one FDB transaction. Each write
/// transaction stops at `CMP_STAGE_MAX_WRITE_BYTES` and hands back a cursor, and a call that crosses
/// `CMP_BULK_ACTIVITY_EARLY_TIMEOUT` returns that cursor to the drain instead of racing the hard
/// activity timeout.
#[activity(StageHotSlice)]
#[timeout = crate::CMP_BULK_ACTIVITY_TIMEOUT_SECS]
#[max_retries = 256]
pub async fn stage_hot_slice(
	ctx: &ActivityCtx,
	input: &StageHotSliceInput,
) -> Result<StageHotSliceOutput> {
	let start = Instant::now();
	let result = stage_hot_slice_inner(ctx, input, start).await;
	// The destination the fold used decides which series the bytes land on, and it is read from the
	// same config the slice itself read.
	metrics::record_hot_stage(
		start,
		&result,
		test_hooks::direct_to_shard(
			input.database_branch_id,
			ctx.config()
				.dynamic()
				.sqlite()
				.compaction_hot_fold_direct_to_shard(),
		),
	);
	result
}

async fn stage_hot_slice_inner(
	ctx: &ActivityCtx,
	input: &StageHotSliceInput,
	start: Instant,
) -> Result<StageHotSliceOutput> {
	// Re-check the admission percent every slice, not just at job start. An operator lowering the
	// percent has to reach jobs already in flight, and a slice boundary is the cheapest safe place to
	// notice: nothing has been read or staged yet this call and the drain's cursors are durable, so
	// parking here costs no work.
	if !input.bypass_admission && !branch_admitted_now(ctx.config(), input.database_branch_id) {
		return Ok(admission_blocked_hot_slice(input.stage_cursor));
	}

	let default_pitr_policy = PitrPolicy::from_config(ctx.config().sqlite());
	let early_timeout = test_hooks::bulk_activity_early_timeout(input.database_branch_id);
	// Read per slice for the same reason admission is: an operator turning this off has to reach
	// slices of jobs already in flight. Each slice's refs record where that slice put its images, so
	// a drain that spans a flip installs correctly either way.
	let direct_to_shard = test_hooks::direct_to_shard(
		input.database_branch_id,
		ctx.config()
			.dynamic()
			.sqlite()
			.compaction_hot_fold_direct_to_shard(),
	);
	// The fold mode decides the class: a direct fold writes the image once, so it is not the
	// duplicate the staging budget exists to bound. Resolved once for the whole slice rather than
	// inside the transaction closures, so a config change mid-flight cannot give two attempts of the
	// same transaction different budgets.
	let throttle_class = throttle::hot_slice_class(direct_to_shard).resolve(ctx.config());

	let plan_input = input.clone();
	let outcome = ctx
		.udb()?
		.txn("depot_hot_stage_slice_plan", move |tx| {
			let input = plan_input.clone();
			async move {
				tx.charge_throttle(DEPOT_COMPACTION_THROTTLE, ThrottleCharge::Read)?;
				tx.priority(Priority::Low)?;
				plan_hot_slice_tx(&tx, &input, default_pitr_policy, throttle_class).await
			}
		})
		.await?;

	let plan = match outcome {
		HotSlicePlanOutcome::Rejected(reason) => return Ok(rejected_hot_slice(reason, 0)),
		HotSlicePlanOutcome::Drained => return Ok(drained_hot_slice()),
		HotSlicePlanOutcome::Stalled { txid } => {
			tracing::warn!(
				database_branch_id = ?input.database_branch_id,
				txid,
				"hot staging cannot plan a slice: commit exceeds the hot slice budget"
			);
			return Ok(stalled_hot_slice(txid));
		}
		HotSlicePlanOutcome::Throttled => {
			metrics::record_compaction_throttled(metrics::COMPACTION_KIND_HOT_STAGE);
			return Ok(throttled_hot_slice(input.stage_cursor, 0));
		}
		#[cfg(feature = "test-faults")]
		HotSlicePlanOutcome::Fault(output) => return Ok(output),
		HotSlicePlanOutcome::Planned(plan) => plan,
	};

	// Decode the fold inputs once and hold them here, so the write transactions below re-read nothing.
	let deltas = Arc::new(decode_hot_delta_chunks(
		input.database_branch_id,
		&plan.hot_inputs.delta_chunks,
	)?);
	// Every commit's own size, so each coverage txid folds against the size the database had at
	// that txid rather than at the slice maximum.
	let db_size_pages_by_txid = Arc::new(
		plan.hot_inputs
			.commits
			.iter()
			.map(|(txid, commit)| (*txid, commit.db_size_pages))
			.collect::<Vec<_>>(),
	);
	ensure!(
		db_size_pages_by_txid
			.iter()
			.any(|(txid, _)| *txid == plan.stage_input.input_range.txids.max_txid),
		"hot compaction selected commit row is missing"
	);
	let stage_input = Arc::new(plan.stage_input);

	let mut stage_cursor = input.stage_cursor;
	let mut staged_bytes = 0_u64;
	loop {
		let tx_stage_input = stage_input.clone();
		let tx_deltas = deltas.clone();
		let tx_db_size_pages_by_txid = db_size_pages_by_txid.clone();
		let outcome = ctx
			.udb()?
			.txn("depot_hot_stage_slice_write", move |tx| {
				let stage_input = tx_stage_input.clone();
				let deltas = tx_deltas.clone();
				let db_size_pages_by_txid = tx_db_size_pages_by_txid.clone();
				async move {
					tx.charge_throttle(DEPOT_COMPACTION_THROTTLE, ThrottleCharge::Both)?;
					tx.priority(Priority::Low)?;
					stage_hot_slice_write_tx(
						&tx,
						&stage_input,
						&deltas,
						&db_size_pages_by_txid,
						stage_cursor,
						direct_to_shard,
						throttle_class,
					)
					.await
				}
			})
			.await?;

		match outcome {
			HotSliceWriteOutcome::Rejected(reason) => {
				return Ok(rejected_hot_slice(reason, staged_bytes));
			}
			#[cfg(feature = "test-faults")]
			HotSliceWriteOutcome::Failed(error) => {
				return Ok(StageHotSliceOutput {
					status: CompactionJobStatus::Failed { error },
					slice: None,
					throttled: false,
					next_stage_cursor: None,
					admission_blocked: false,
					staged_bytes,
					stalled_at_txid: None,
				});
			}
			HotSliceWriteOutcome::Throttled => {
				// The cluster-wide compaction write budget is spent this window. Hand the cursor back
				// so the drain backs off instead of spinning against the budget. Nothing was written
				// this transaction, so no work is lost.
				metrics::record_compaction_throttled(metrics::COMPACTION_KIND_HOT_STAGE);
				return Ok(throttled_hot_slice(stage_cursor, staged_bytes));
			}
			HotSliceWriteOutcome::Wrote {
				staged_bytes: tx_staged_bytes,
				next_stage_cursor,
			} => {
				staged_bytes = staged_bytes.saturating_add(tx_staged_bytes);
				stage_cursor = next_stage_cursor;
				if stage_cursor.is_none() {
					break;
				}
				// The images this transaction staged are committed, so returning the cursor loses no
				// work. The drain immediately re-dispatches from it with a fresh timeout budget.
				if start.elapsed() > early_timeout {
					return Ok(StageHotSliceOutput {
						status: CompactionJobStatus::Succeeded,
						slice: None,
						throttled: false,
						next_stage_cursor: stage_cursor,
						admission_blocked: false,
						staged_bytes,
						stalled_at_txid: None,
					});
				}
			}
		}
	}

	Ok(StageHotSliceOutput {
		status: CompactionJobStatus::Succeeded,
		slice: Some(HotSliceOutput {
			input_range: stage_input.input_range.clone(),
			input_fingerprint: stage_input.input_fingerprint,
			staged_bytes,
		}),
		throttled: false,
		next_stage_cursor: None,
		admission_blocked: false,
		staged_bytes,
		stalled_at_txid: None,
	})
}

enum HotSlicePlanOutcome {
	/// The branch is no longer a valid target for this job.
	Rejected(String),
	/// No commits are left in the drain window.
	Drained,
	/// A commit sits in the drain window that the slice budget cannot admit even when empty, so no
	/// later slice can admit it either. Distinct from `Drained`: the branch's hot lane cannot
	/// advance past this txid without a wider budget or a smaller commit.
	Stalled {
		txid: u64,
	},
	/// The compaction read budget for this window is spent; nothing was read.
	Throttled,
	/// A test fault decided the slice's outcome before staging.
	#[cfg(feature = "test-faults")]
	Fault(StageHotSliceOutput),
	Planned(Box<HotSlicePlan>),
}

/// One slice's staging plan plus the fold inputs it was derived from, held in activity memory across
/// the slice's write transactions. Nothing here crosses a gasoline boundary: the activity returns only
/// scalars and the cursor.
struct HotSlicePlan {
	stage_input: StageHotJobInput,
	hot_inputs: HotInputSnapshot,
}

enum HotSliceWriteOutcome {
	/// The branch went stale between planning and this transaction.
	Rejected(String),
	/// The compaction write budget for this window is spent; nothing was written.
	Throttled,
	#[cfg(feature = "test-faults")]
	Failed(String),
	/// The transaction staged `staged_bytes` of shard images. `next_stage_cursor` is `Some` when it
	/// stopped at the write cap with images left to stage.
	Wrote {
		staged_bytes: u64,
		next_stage_cursor: Option<HotStageCursor>,
	},
}

/// Plans one stage slice, gating on the read budget before it touches any DELTA history.
async fn plan_hot_slice_tx(
	tx: &universaldb::Transaction,
	input: &StageHotSliceInput,
	default_pitr_policy: Option<PitrPolicy>,
	throttle_class: ThrottleClass,
) -> Result<HotSlicePlanOutcome> {
	let result = plan_hot_slice_tx_inner(tx, input, default_pitr_policy, throttle_class).await?;
	#[cfg(feature = "test-faults")]
	test_hooks::stage_write_probe::record_plan_read(tx.read_bytes());

	Ok(result)
}

async fn plan_hot_slice_tx_inner(
	tx: &universaldb::Transaction,
	input: &StageHotSliceInput,
	default_pitr_policy: Option<PitrPolicy>,
	throttle_class: ThrottleClass,
) -> Result<HotSlicePlanOutcome> {
	#[cfg(feature = "test-faults")]
	if let Some(output) = hot_stage_fault_output(
		input.database_branch_id,
		HotCompactionFaultPoint::StageBeforeInputRead,
	)
	.await?
	{
		return Ok(HotSlicePlanOutcome::Fault(output));
	}

	let branch_record = tx_get_value(
		tx,
		&keys::branches_list_key(input.database_branch_id),
		Serializable,
	)
	.await?
	.as_deref()
	.map(decode_database_branch_record)
	.transpose()
	.context("decode sqlite database branch record for hot compaction")?;
	if !branch_record_is_live_at_generation(branch_record.as_ref(), input.base_lifecycle_generation)
	{
		return Ok(
			HotSlicePlanOutcome::Rejected("database branch lifecycle changed".to_string()).into(),
		);
	}

	let root = read_compaction_root_or_default(tx, input.database_branch_id).await?;
	if root.manifest_generation != input.base_manifest_generation {
		return Ok(
			HotSlicePlanOutcome::Rejected("base manifest generation changed".to_string()).into(),
		);
	}

	// Read /META/head with Snapshot isolation. Every commit writes this key, so a Serializable read
	// puts it in the stage transaction's conflict range and a single concurrent commit aborts the
	// stage with FdbError 1020. Under a sustained writer that conflict never clears, the activity
	// exhausts its retries, and the hot compactor workflow dies. Staging is best-effort work against
	// a pinned drain window: the head_txid is immediately overwritten with the drain-start capture
	// below, the DELTA/PIDX history is already read Snapshot, and the staged output is
	// content-addressed and idempotent. Correctness is enforced later by the manager install, which
	// re-reads Serializable, revalidates the generation, and advances the watermark atomically. So
	// stage must lag behind live rather than serialize against the actor.
	let Some(mut head) = tx_get_value(
		tx,
		&keys::branch_meta_head_key(input.database_branch_id),
		Snapshot,
	)
	.await?
	.as_deref()
	.map(decode_db_head)
	.transpose()
	.context("decode sqlite head for hot compaction")?
	else {
		return Ok(HotSlicePlanOutcome::Drained);
	};
	// Pin the head to the drain-start capture so every slice across the drain sees the same head,
	// regardless of commits that land while the drain runs.
	head.head_txid = input.drain_head_txid;

	// Back off before the heavy input read if the cluster-wide compaction read budget for this window
	// is spent. Checked here, after the cheap metadata reads have confirmed a live branch with a head,
	// so a throttled stage slice touches none of the DELTA history. This bounds the stage-read
	// amplification: a deep overwrite chain that would otherwise re-read the same contiguous slice
	// every backoff cannot pin storage processes on reads. No cursor advances, so the drain simply
	// retries this same slice after backing off, exactly like the write throttle.
	let read_decision = tx.check_throttle(
		DEPOT_COMPACTION_THROTTLE,
		ThrottleKind::Read,
		throttle_class,
	)?;
	if !read_decision.allowed {
		return Ok(HotSlicePlanOutcome::Throttled);
	}

	let db_pins = history_pin::read_db_history_pins(tx, input.database_branch_id, Snapshot).await?;
	let pitr_policy =
		read_effective_pitr_policy_for_branch(tx, branch_record.as_ref(), default_pitr_policy)
			.await?;
	let hot_inputs = read_hot_input_snapshot(
		tx,
		input.database_branch_id,
		Some(&head),
		&root,
		input.cursor_min_txid,
		input.cursor_min_segment_pgno,
		Snapshot,
		pitr_policy,
		input.drain_now_ms,
	)
	.await?;
	// A commit the budget could not admit ends the drain here. Staging the slices before it is still
	// correct; the install stops at the same commit and finalizes the watermark below it, so the
	// commit stays unfolded history rather than being skipped. The install is what logs that, since it
	// is the step that moves the watermark.
	let Some(selected_max_txid) = hot_inputs.selected_max_txid else {
		// Nothing was selected. Either the window is genuinely empty, or its first commit does not fit
		// the slice budget; the install side already separates those two, and staging must too, so a
		// branch that cannot advance does not report itself finished.
		return Ok(match hot_inputs.oversized_commit_txid {
			Some(txid) => HotSlicePlanOutcome::Stalled { txid },
			None => HotSlicePlanOutcome::Drained,
		});
	};
	let min_txid = input
		.cursor_min_txid
		.unwrap_or_else(|| root.hot_watermark_txid.saturating_add(1));
	let coverage_txids = selected_hot_coverage_txids(
		&root,
		selected_max_txid,
		hot_inputs.selected_max_pgno_exclusive,
		&db_pins,
		&hot_inputs.pitr_interval_coverage,
	);
	let input_range = HotJobInputRange {
		txids: TxidRange {
			min_txid,
			max_txid: selected_max_txid,
		},
		max_pgno_exclusive: hot_inputs.selected_max_pgno_exclusive,
		coverage_txids: coverage_txids.clone(),
		max_pages: u32::try_from(hot_inputs.pidx_entries.len()).unwrap_or(u32::MAX),
		max_bytes: hot_inputs.total_value_bytes,
	};
	let input_fingerprint = fingerprint_hot_inputs(
		input.database_branch_id,
		&root,
		&head,
		&coverage_txids,
		&hot_inputs,
	);
	#[cfg(feature = "test-faults")]
	if let Some(output) = hot_stage_fault_output(
		input.database_branch_id,
		HotCompactionFaultPoint::StageAfterInputRead,
	)
	.await?
	{
		return Ok(HotSlicePlanOutcome::Fault(output));
	}

	Ok(HotSlicePlanOutcome::Planned(Box::new(HotSlicePlan {
		stage_input: StageHotJobInput {
			database_branch_id: input.database_branch_id,
			job_id: input.job_id,
			job_kind: CompactionJobKind::Hot,
			base_lifecycle_generation: input.base_lifecycle_generation,
			base_manifest_generation: input.base_manifest_generation,
			input_fingerprint,
			input_range,
		},
		hot_inputs,
	})))
}

/// Stages the next batch of the slice's folded shard images, capped at `CMP_STAGE_MAX_WRITE_BYTES`.
/// The branch lifecycle and manifest generation are revalidated here, not just at planning time, so a
/// branch that goes stale mid-slice stops staging instead of filling the staging area with work the
/// install would reject.
///
/// The images this writes are merges, not copies: `load_merge_base_shard_blob` reads the newest
/// installed and newest already-staged image for every shard it stages, so a transaction bounded to
/// `CMP_STAGE_MAX_WRITE_BYTES` of writes reads a multiple of that, which is why the transaction opts
/// into both axes rather than the write axis alone.
///
/// Charge-only, with no read gate: the slice is already gated on the read axis when it is planned,
/// and failing here would strand a partially staged slice behind a cursor.
async fn stage_hot_slice_write_tx(
	tx: &universaldb::Transaction,
	stage_input: &StageHotJobInput,
	deltas: &BTreeMap<u64, DecodedLtx>,
	db_size_pages_by_txid: &[(u64, u32)],
	stage_cursor: Option<HotStageCursor>,
	direct_to_shard: bool,
	throttle_class: ThrottleClass,
) -> Result<HotSliceWriteOutcome> {
	let outcome = stage_hot_slice_write_tx_inner(
		tx,
		stage_input,
		deltas,
		db_size_pages_by_txid,
		stage_cursor,
		direct_to_shard,
		throttle_class,
	)
	.await?;
	#[cfg(feature = "test-faults")]
	test_hooks::stage_write_probe::record_write_read(tx.read_bytes());

	Ok(outcome)
}

async fn stage_hot_slice_write_tx_inner(
	tx: &universaldb::Transaction,
	stage_input: &StageHotJobInput,
	deltas: &BTreeMap<u64, DecodedLtx>,
	db_size_pages_by_txid: &[(u64, u32)],
	stage_cursor: Option<HotStageCursor>,
	direct_to_shard: bool,
	throttle_class: ThrottleClass,
) -> Result<HotSliceWriteOutcome> {
	let branch_record = tx_get_value(
		tx,
		&keys::branches_list_key(stage_input.database_branch_id),
		Serializable,
	)
	.await?
	.as_deref()
	.map(decode_database_branch_record)
	.transpose()
	.context("decode sqlite database branch record for hot compaction")?;
	if !branch_record_is_live_at_generation(
		branch_record.as_ref(),
		stage_input.base_lifecycle_generation,
	) {
		return Ok(HotSliceWriteOutcome::Rejected(
			"database branch lifecycle changed".to_string(),
		));
	}

	let root = read_compaction_root_or_default(tx, stage_input.database_branch_id).await?;
	if root.manifest_generation != stage_input.base_manifest_generation {
		return Ok(HotSliceWriteOutcome::Rejected(
			"base manifest generation changed".to_string(),
		));
	}

	// Back off before writing if the cluster-wide compaction write budget for this window is spent. No
	// shards are written and the cursor does not advance, so the drain simply retries from the same
	// cursor after backing off.
	let decision = tx.check_throttle(
		DEPOT_COMPACTION_THROTTLE,
		ThrottleKind::Write,
		throttle_class,
	)?;
	if !decision.allowed {
		return Ok(HotSliceWriteOutcome::Throttled);
	}

	let staged = write_staged_hot_shards(
		tx,
		stage_input,
		deltas,
		db_size_pages_by_txid,
		stage_cursor,
		direct_to_shard,
	)
	.await?;
	let staged = match staged {
		StagedHotShards::Staged(staged) => staged,
	};
	#[cfg(feature = "test-faults")]
	test_hooks::stage_write_probe::record(staged.staged_bytes);
	#[cfg(feature = "test-faults")]
	if let Some(outcome) =
		hot_stage_after_shard_write_fault_outcome(tx, stage_input, &staged).await?
	{
		return Ok(outcome);
	}

	Ok(HotSliceWriteOutcome::Wrote {
		staged_bytes: staged.staged_bytes,
		next_stage_cursor: staged.next_stage_cursor,
	})
}

fn drained_hot_slice() -> StageHotSliceOutput {
	StageHotSliceOutput {
		status: CompactionJobStatus::Succeeded,
		slice: None,
		throttled: false,
		next_stage_cursor: None,
		admission_blocked: false,
		staged_bytes: 0,
		stalled_at_txid: None,
	}
}

/// A drain window whose first commit the slice budget cannot admit. Shaped like a drain because
/// there is nothing to stage and no cursor to hand back, but flagged so the pass metric and the log
/// separate a branch that finished from one that cannot start.
fn stalled_hot_slice(txid: u64) -> StageHotSliceOutput {
	StageHotSliceOutput {
		status: CompactionJobStatus::Succeeded,
		slice: None,
		throttled: false,
		next_stage_cursor: None,
		admission_blocked: false,
		staged_bytes: 0,
		stalled_at_txid: Some(txid),
	}
}

/// A throttled slice staged nothing this call and hands its cursor back to be re-dispatched, so the
/// slice is still outstanding. Report `Requested` to match the install and reclaim throttle paths;
/// every consumer branches on `throttled` before reading the status.
fn throttled_hot_slice(
	next_stage_cursor: Option<HotStageCursor>,
	staged_bytes: u64,
) -> StageHotSliceOutput {
	StageHotSliceOutput {
		status: CompactionJobStatus::Requested,
		slice: None,
		throttled: true,
		next_stage_cursor,
		admission_blocked: false,
		staged_bytes,
		stalled_at_txid: None,
	}
}

/// A de-admitted slice read and staged nothing, so it hands its staging cursor straight back and the
/// drain parks on it until the admission percent is raised again.
fn admission_blocked_hot_slice(next_stage_cursor: Option<HotStageCursor>) -> StageHotSliceOutput {
	StageHotSliceOutput {
		status: CompactionJobStatus::Requested,
		slice: None,
		throttled: false,
		next_stage_cursor,
		admission_blocked: true,
		staged_bytes: 0,
		stalled_at_txid: None,
	}
}

/// A rejected slice may still have staged images in an earlier write transaction of the same call.
/// Those rows are durable and become this job's staging garbage, so report them rather than losing
/// them from the staged-byte total.
fn rejected_hot_slice(reason: impl Into<String>, staged_bytes: u64) -> StageHotSliceOutput {
	StageHotSliceOutput {
		status: CompactionJobStatus::Rejected {
			reason: reason.into(),
		},
		slice: None,
		throttled: false,
		next_stage_cursor: None,
		admission_blocked: false,
		staged_bytes,
		stalled_at_txid: None,
	}
}

#[cfg(feature = "test-faults")]
async fn hot_stage_fault_output(
	database_branch_id: DatabaseBranchId,
	point: HotCompactionFaultPoint,
) -> Result<Option<StageHotSliceOutput>> {
	match test_hooks::maybe_fire_hot_compaction_fault(database_branch_id, point).await {
		Ok(Some(_)) | Ok(None) => Ok(None),
		Err(err) => Ok(Some(failed_hot_slice(err))),
	}
}

/// Drops this transaction's staged shard images while still reporting them as staged, so tests can
/// exercise the install's missing-artifact path. The transaction's own byte count and cursor are kept
/// so the drain advances exactly as it would have.
#[cfg(feature = "test-faults")]
async fn hot_stage_after_shard_write_fault_outcome(
	tx: &universaldb::Transaction,
	stage_input: &StageHotJobInput,
	staged: &StagedHotShardsOutput,
) -> Result<Option<HotSliceWriteOutcome>> {
	match test_hooks::maybe_fire_hot_compaction_fault(
		stage_input.database_branch_id,
		HotCompactionFaultPoint::StageAfterShardWrite,
	)
	.await
	{
		Ok(Some(fired)) if fired.action == DepotFaultAction::DropArtifact => {
			for output_ref in &staged.output_refs {
				let (stage_begin, stage_end) = keys::branch_compaction_stage_hot_shard_txid_range(
					stage_input.database_branch_id,
					stage_input.job_id,
					output_ref.shard_id,
					output_ref.as_of_txid,
				);
				tx.informal().clear_range(&stage_begin, &stage_end);
			}
			Ok(Some(HotSliceWriteOutcome::Wrote {
				staged_bytes: staged.staged_bytes,
				next_stage_cursor: staged.next_stage_cursor,
			}))
		}
		Ok(Some(_)) | Ok(None) => Ok(None),
		Err(err) => Ok(Some(HotSliceWriteOutcome::Failed(err.to_string()))),
	}
}

#[cfg(feature = "test-faults")]
fn failed_hot_slice(err: anyhow::Error) -> StageHotSliceOutput {
	StageHotSliceOutput {
		status: CompactionJobStatus::Failed {
			error: err.to_string(),
		},
		slice: None,
		throttled: false,
		next_stage_cursor: None,
		stalled_at_txid: None,
		admission_blocked: false,
		staged_bytes: 0,
	}
}

/// Installs the entire hot drain. The merged `output_refs` span `[hot_watermark+1 .. H0]`; the
/// install re-derives the same budget chunks via a cursor, running each chunk in its own FDB
/// transaction (copy staged shards, clear PIDX, set PITR intervals) without touching the manifest,
/// then a final transaction advances `hot_watermark_txid` to `H0` and bumps `manifest_generation`
/// once. COMMITS are never cleared here, so the chunk boundaries stay stable across retries and the
/// whole install is idempotent (shard copies are content-addressed, PIDX clears are
/// `COMPARE_AND_CLEAR`).
///
/// A chunk copies each staged image into the live SHARD tier byte for byte, so its write volume equals
/// the bytes staging wrote for that chunk and is unbounded for the same reason staging's is: staging
/// spreads a wide slice over many transactions, so a chunk can hold far more than one FDB transaction
/// admits. Copying therefore stops at `CMP_INSTALL_MAX_WRITE_BYTES` and resumes from a
/// `(shard_id, as_of_txid)` cursor. The chunk's PIDX clears, fold-index rows, and PITR coverage land
/// only in the transaction that finishes its copies, so a partially copied chunk publishes nothing:
/// the extra shard versions are unreferenced until the PIDX rows clear, and the watermark still moves
/// only at finalize.
#[activity(InstallHotJob)]
#[timeout = crate::CMP_BULK_ACTIVITY_TIMEOUT_SECS]
#[max_retries = 256]
pub async fn install_hot_job(
	ctx: &ActivityCtx,
	input: &InstallHotJobInput,
) -> Result<InstallHotJobOutput> {
	let start = Instant::now();
	let output = install_hot_job_inner(ctx, input).await;
	metrics::record_hot_install(start, &output);
	output
}

async fn install_hot_job_inner(
	ctx: &ActivityCtx,
	input: &InstallHotJobInput,
) -> Result<InstallHotJobOutput> {
	if input.job_kind != CompactionJobKind::Hot {
		return Ok(rejected_hot_install("manager received a non-hot job"));
	}

	let early_timeout = test_hooks::bulk_activity_early_timeout(input.database_branch_id);
	let default_pitr_policy = PitrPolicy::from_config(ctx.config().sqlite());
	// Resolved once for the whole install rather than inside the transaction closure, so a config
	// change mid-flight cannot give two attempts of the same transaction different budgets.
	let throttle_class = throttle::CompactionThrottleClass::Install.resolve(ctx.config());
	let start = Instant::now();
	// `H0` unless the drain stops early below a commit no slice can admit.
	//
	// A partial fold does not need handling here. Install re-derives every slice from FDB, so the
	// manager hands it txid bounds with no page bound at all, and the chunk loop holds the txid
	// cursor until the commit is whole. The watermark therefore never advances onto a commit whose
	// delta still has pages above the bound, which is the case that would let readers take its shard
	// images as a delta-walk floor and miss them (`read/shard.rs` caps every floor at the
	// watermark).
	let mut target_watermark = input.input_range.txids.max_txid;
	let database_branch_id = input.database_branch_id;
	let mut cursor = input
		.resume_cursor
		.unwrap_or(input.input_range.txids.min_txid);
	let mut cursor_segment_pgno = input.resume_cursor_segment_pgno;
	let mut shard_cursor = input.resume_shard_cursor;
	let mut installed_shard_count = input.installed_shard_count_before;
	let mut installed_shard_bytes = input.installed_shard_bytes_before;
	let mut copied_shard_bytes = 0u64;
	loop {
		let input = input.clone();
		let outcome = ctx
			.udb()?
			.txn("depot_hot_compact_install_chunk", move |tx| {
				let input = input.clone();
				async move {
					tx.charge_throttle(DEPOT_COMPACTION_THROTTLE, ThrottleCharge::Both)?;
					tx.priority(Priority::Low)?;
					// Pin the PITR clock to the drain-start capture (T0) so each chunk's recomputed
					// coverage matches the staged shards.
					install_hot_chunk_tx(
						&tx,
						&input,
						cursor,
						cursor_segment_pgno,
						shard_cursor,
						input.drain_now_ms,
						default_pitr_policy,
						throttle_class,
					)
					.await
				}
			})
			.await?;

		match outcome {
			HotInstallChunkOutcome::Terminal(output) => return Ok(output),
			HotInstallChunkOutcome::Continue {
				cursor: next_cursor,
				cursor_segment_pgno: next_cursor_segment_pgno,
				shard_cursor: next_shard_cursor,
				copied_shard_count,
				installed_bytes,
				copied_bytes,
			} => {
				cursor = next_cursor;
				cursor_segment_pgno = next_cursor_segment_pgno;
				shard_cursor = next_shard_cursor;
				installed_shard_count =
					installed_shard_count.saturating_add(copied_shard_count as u64);
				installed_shard_bytes = installed_shard_bytes.saturating_add(installed_bytes);
				copied_shard_bytes = copied_shard_bytes.saturating_add(copied_bytes);
				// The transaction committed, so returning the cursors loses no work. The manager
				// immediately re-dispatches the activity from them with a fresh timeout budget, so slow
				// chunk transactions can never push this loop into the hard activity timeout.
				if start.elapsed() > early_timeout {
					return Ok(InstallHotJobOutput {
						status: CompactionJobStatus::Requested,
						resume_cursor: Some(cursor),
						resume_cursor_segment_pgno: cursor_segment_pgno,
						resume_shard_cursor: shard_cursor,
						throttled: false,
						installed_shard_count,
						installed_shard_bytes,
						copied_shard_bytes,
					});
				}
			}
			HotInstallChunkOutcome::Throttled => {
				// The cluster-wide compaction write budget is spent this window. Hand the cursors back
				// so the manager backs off and re-dispatches, instead of spinning against the budget.
				// Nothing was written this transaction, so no work is lost.
				metrics::record_compaction_throttled(metrics::COMPACTION_KIND_HOT_INSTALL);
				return Ok(InstallHotJobOutput {
					status: CompactionJobStatus::Requested,
					resume_cursor: Some(cursor),
					resume_cursor_segment_pgno: cursor_segment_pgno,
					resume_shard_cursor: shard_cursor,
					throttled: true,
					installed_shard_count,
					installed_shard_bytes,
					copied_shard_bytes,
				});
			}
			HotInstallChunkOutcome::StoppedAtOversizedCommit { txid } => {
				tracing::warn!(
					?database_branch_id,
					txid,
					"hot install stopped below a commit that exceeds the hot slice budget"
				);
				target_watermark = txid.saturating_sub(1);
				break;
			}
			HotInstallChunkOutcome::Drained => break,
		}
	}

	let input = input.clone();
	ctx.udb()?
		.txn("depot_hot_compact_install_finalize", move |tx| {
			let input = input.clone();
			async move {
				tx.charge_throttle(DEPOT_COMPACTION_THROTTLE, ThrottleCharge::Both)?;
				tx.priority(Priority::Low)?;
				install_hot_finalize_tx(
					&tx,
					&input,
					target_watermark,
					installed_shard_count,
					installed_shard_bytes,
					copied_shard_bytes,
				)
				.await
			}
		})
		.await
}

enum HotInstallChunkOutcome {
	/// The transaction committed, having installed `copied_shard_count` shards totalling
	/// `installed_bytes` of shard image bytes, whether it copied them from the staging area or
	/// published them where the fold already wrote them. `shard_cursor` is `Some` when the chunk
	/// stopped at the write cap, in which case `cursor` still points at the same chunk; `None` means
	/// the chunk finished and `cursor` is the next chunk.
	Continue {
		cursor: u64,
		/// Resume position within `cursor`, when that commit was installed only in part. Mirrors the
		/// staging cursor so install re-derives exactly the slices staging produced.
		cursor_segment_pgno: Option<u32>,
		shard_cursor: Option<HotInstallShardCursor>,
		copied_shard_count: usize,
		/// Image bytes this chunk installed, whether it copied them or published them in place. This
		/// is the observability signal for installed volume, so it must not collapse to zero just
		/// because a direct fold writes no blob bytes here.
		installed_bytes: u64,
		/// The subset of `installed_bytes` this chunk actually rewrote. Zero for a direct fold, whose
		/// image is already in its live rows. Reported separately so write amplification stays
		/// measurable once the two stop being the same number.
		copied_bytes: u64,
	},
	/// The next commit does not fit a slice budget, so nothing at or above it was folded. Finalize
	/// with the watermark just below it.
	StoppedAtOversizedCommit { txid: u64 },
	/// The cursor advanced past `H0`; nothing more to install, proceed to finalize.
	Drained,
	/// A throttle budget (read or write) was spent before this chunk touched anything; back off and
	/// resume from the same cursor.
	Throttled,
	/// The chunk was rejected or failed; return this output to the manager unchanged.
	Terminal(InstallHotJobOutput),
}

async fn install_hot_chunk_tx(
	tx: &universaldb::Transaction,
	input: &InstallHotJobInput,
	cursor: u64,
	cursor_segment_pgno: Option<u32>,
	shard_cursor: Option<HotInstallShardCursor>,
	now_ms: i64,
	default_pitr_policy: Option<PitrPolicy>,
	throttle_class: ThrottleClass,
) -> Result<HotInstallChunkOutcome> {
	// Back off before doing any chunk work if either cluster-wide compaction budget for this window is
	// spent. These are cheap snapshot reads up front so a throttled call touches nothing: the read gate
	// keeps the chunk's `read_hot_input_snapshot` off FDB, the write gate keeps its shard copies off.
	let write_decision = tx.check_throttle(
		DEPOT_COMPACTION_THROTTLE,
		ThrottleKind::Write,
		throttle_class,
	)?;
	if !write_decision.allowed {
		return Ok(HotInstallChunkOutcome::Throttled);
	}
	let read_decision = tx.check_throttle(
		DEPOT_COMPACTION_THROTTLE,
		ThrottleKind::Read,
		throttle_class,
	)?;
	if !read_decision.allowed {
		return Ok(HotInstallChunkOutcome::Throttled);
	}

	let branch_record = tx_get_value(
		tx,
		&keys::branches_list_key(input.database_branch_id),
		Serializable,
	)
	.await?
	.as_deref()
	.map(decode_database_branch_record)
	.transpose()
	.context("decode sqlite database branch record for hot install")?;
	if !branch_record_is_live_at_generation(branch_record.as_ref(), input.base_lifecycle_generation)
	{
		return Ok(HotInstallChunkOutcome::Terminal(rejected_hot_install(
			"database branch lifecycle changed",
		)));
	}

	let root = read_compaction_root_or_default(tx, input.database_branch_id).await?;
	if root.manifest_generation != input.base_manifest_generation {
		return Ok(HotInstallChunkOutcome::Terminal(rejected_hot_install(
			"base manifest generation changed",
		)));
	}

	// Read /META/head with Snapshot isolation for the same reason as staging: every commit writes this
	// key, so a Serializable read conflicts with any concurrent commit and a sustained writer aborts
	// install with FdbError 1020 until the activity dies. The head_txid is immediately overwritten with
	// the pinned drain capture (H0) below, and a branch delete is still fenced by the Serializable
	// branch-record read above, so the head value itself needs no serialization.
	let Some(mut head) = tx_get_value(
		tx,
		&keys::branch_meta_head_key(input.database_branch_id),
		Snapshot,
	)
	.await?
	.as_deref()
	.map(decode_db_head)
	.transpose()
	.context("decode sqlite head for hot install")?
	else {
		return Ok(HotInstallChunkOutcome::Terminal(rejected_hot_install(
			"database branch head is missing",
		)));
	};
	// Pin the head to the drain-start capture (H0) so cursors past H0 drain and the re-derived chunk
	// boundaries match the staged slices even if commits landed while the drain ran.
	head.head_txid = input.drain_head_txid;

	let mut db_pins =
		history_pin::read_db_history_pins(tx, input.database_branch_id, Serializable).await?;
	if resolve_bucket_fork_pins(tx, input.database_branch_id, &mut db_pins).await? {
		return Ok(HotInstallChunkOutcome::Terminal(rejected_hot_install(
			"bucket fork proof is ambiguous",
		)));
	}
	let pitr_policy =
		read_effective_pitr_policy_for_branch(tx, branch_record.as_ref(), default_pitr_policy)
			.await?;
	// Read the fold inputs with Snapshot isolation. The commit-range, DELTA, and COMMITS reads are all
	// bounded at H0 and every new commit lands at a txid above H0, so those never overlap a concurrent
	// commit. The one exception is the PIDX point-reads: PIDX is page-keyed, so an overwrite commit
	// rewrites PIDX[pgno] for a page this chunk folds and a Serializable read conflict-aborts install
	// under a sustained writer (the install-side FdbError 1020). Snapshot is safe because the PIDX clear
	// below uses COMPARE_AND_CLEAR, which takes no read-conflict range and is evaluated against the live
	// value at commit: a page overwritten after this read has a live PIDX owner above H0, so the clear
	// no-ops and the page correctly stays owned by its newer delta. The installed shard content comes
	// from the content-hash-validated staged blob, not this read, so a stale owner cannot omit a page or
	// advance the watermark past unfolded data.
	let hot_inputs = read_hot_input_snapshot(
		tx,
		input.database_branch_id,
		Some(&head),
		&root,
		Some(cursor),
		cursor_segment_pgno,
		Snapshot,
		pitr_policy,
		now_ms,
	)
	.await?;
	let Some(selected_max_txid) = hot_inputs.selected_max_txid else {
		// A commit the budget could not admit was never folded, so the drain ends below it. Treating
		// it as drained would advance the watermark to `H0`, past unfolded history: the commit's
		// pages would stay PIDX-owned, and the stale-PIDX sweep would later clear those rows against
		// an older image and serve stale pages.
		if let Some(txid) = hot_inputs.oversized_commit_txid {
			return Ok(HotInstallChunkOutcome::StoppedAtOversizedCommit { txid });
		}
		// The cursor advanced past the captured head; the drain is fully installed.
		return Ok(HotInstallChunkOutcome::Drained);
	};
	let coverage_txids = selected_hot_coverage_txids(
		&root,
		selected_max_txid,
		hot_inputs.selected_max_pgno_exclusive,
		&db_pins,
		&hot_inputs.pitr_interval_coverage,
	)
	.into_iter()
	.collect::<BTreeSet<_>>();
	// Staging folds coverage plus the slice's partially admitted commit, so validating refs against
	// coverage alone would reject the partial commit's own images. Coverage stays the narrower list
	// because it is what licenses delta reclaim.
	let chunk_input_range = HotJobInputRange {
		txids: TxidRange {
			min_txid: cursor,
			max_txid: selected_max_txid,
		},
		max_pgno_exclusive: hot_inputs.selected_max_pgno_exclusive,
		coverage_txids: coverage_txids.iter().copied().collect(),
		max_pages: 0,
		max_bytes: 0,
	};
	let fold_txids = hot_fold_txids(&chunk_input_range)
		.into_iter()
		.collect::<BTreeSet<_>>();

	let mut staged_outputs = BTreeSet::new();
	let mut latest_staged_shards = BTreeSet::new();
	#[cfg(feature = "test-faults")]
	if let Some(output) = hot_install_before_staged_read_fault_output(tx, input, cursor).await? {
		return Ok(HotInstallChunkOutcome::Terminal(output));
	}
	// Re-derive this chunk's staged refs from the FDB staging area instead of carrying them through
	// workflow state. The companion stamped every ref row with its slice's `min_txid`, and the install
	// re-derives the same cursor sequence, so scanning `min_txid == cursor` yields exactly the refs the
	// slice staged.
	let mut chunk_output_refs = read_staged_hot_shard_refs_for_slice(
		tx,
		input.database_branch_id,
		input.job_id,
		cursor,
		Serializable,
	)
	.await?;
	// Copy in `(shard_id, as_of_txid)` order so a chunk that stops at the write cap resumes from a
	// cursor no matter what order the scan returned its rows in.
	chunk_output_refs.sort_by_key(|output_ref| HotInstallShardCursor {
		shard_id: output_ref.shard_id,
		as_of_txid: output_ref.as_of_txid,
	});

	// Validate the chunk's whole ref set before copying any of it, even when this transaction only
	// copies part of the set. The PIDX validation below checks every folded page against the shards
	// staged at `selected_max_txid`, so it needs the complete set to be correct. Ref rows carry no page
	// data, so reading all of them costs orders of magnitude less than the images they point at.
	//
	// Each distinct `as_of_txid` in the chunk is a fold (a coverage txid: pin, PITR rep, or the slice
	// boundary), collected here for the fold index the finishing transaction writes.
	let mut folds: BTreeMap<u64, BTreeSet<u32>> = BTreeMap::new();
	for output_ref in &chunk_output_refs {
		if !fold_txids.contains(&output_ref.as_of_txid)
			|| output_ref.max_txid != output_ref.as_of_txid
		{
			return Ok(HotInstallChunkOutcome::Terminal(rejected_hot_install(
				"hot output ref does not match planned txid range",
			)));
		}
		if !staged_outputs.insert((output_ref.shard_id, output_ref.as_of_txid)) {
			return Ok(HotInstallChunkOutcome::Terminal(rejected_hot_install(
				"duplicate staged hot shard output ref",
			)));
		}
		if output_ref.as_of_txid == selected_max_txid
			&& !latest_staged_shards.insert(output_ref.shard_id)
		{
			return Ok(HotInstallChunkOutcome::Terminal(rejected_hot_install(
				"duplicate latest hot shard output ref",
			)));
		}
		folds
			.entry(output_ref.as_of_txid)
			.or_default()
			.insert(output_ref.shard_id);
	}
	#[cfg(feature = "test-faults")]
	if let Some(output) = hot_install_fault_output(
		input.database_branch_id,
		HotCompactionFaultPoint::InstallAfterStagedRead,
	)
	.await?
	{
		return Ok(HotInstallChunkOutcome::Terminal(output));
	}

	#[cfg(feature = "test-faults")]
	if let Some(output) = hot_install_fault_output(
		input.database_branch_id,
		HotCompactionFaultPoint::InstallBeforeShardPublish,
	)
	.await?
	{
		return Ok(HotInstallChunkOutcome::Terminal(output));
	}
	// Two counters, deliberately: `charged_bytes` is what this transaction owes against its write
	// budget, and `copied_bytes` is blob bytes it actually rewrote. A direct fold charges its image
	// (the chunk still emits a PIDX clear and a fold-index row for it) while copying nothing, so
	// conflating the two would either uncap the transaction or claim a copy that never happened.
	let mut charged_bytes = 0u64;
	let mut copied_bytes = 0u64;
	let mut copied_shard_count = 0usize;
	let mut next_shard_cursor = None;
	for output_ref in &chunk_output_refs {
		let ref_cursor = HotInstallShardCursor {
			shard_id: output_ref.shard_id,
			as_of_txid: output_ref.as_of_txid,
		};
		// The cursor names the first ref this transaction still owes, so skip everything before it.
		if let Some(resume_cursor) = shard_cursor
			&& ref_cursor < resume_cursor
		{
			continue;
		}
		// Stop before the image that would take this transaction past the cap. Checking before the copy
		// rather than after means a transaction overshoots by at most one image and always copies at
		// least one, so a chunk whose first image alone exceeds the cap still makes progress.
		if charged_bytes >= CMP_INSTALL_MAX_WRITE_BYTES {
			next_shard_cursor = Some(ref_cursor);
			break;
		}

		// Where the image lives is discovered, not declared. A staged fold left its blob under this
		// job's subspace and still owes the copy below; a direct fold wrote straight into `SHARD` and
		// owes nothing. Probing keeps the mode out of the ref schema, so switching a branch to direct
		// folds changes no persisted format and needs no coordinated deploy.
		//
		// The direct case is only a key-range existence probe, never a blob read. It is not optional:
		// the PIDX clears below are what make pages resolve through the shard tier, so clearing them
		// against a version that is absent would strand those pages on an older image. The image is
		// deliberately not re-validated against its content hash, because reading it back would
		// restore exactly the read amplification this change removes.
		let stage_chunk_prefix = keys::branch_compaction_stage_hot_shard_txid_prefix(
			input.database_branch_id,
			input.job_id,
			output_ref.shard_id,
			output_ref.as_of_txid,
		);
		let stage_rows = tx_scan_prefix_values(tx, &stage_chunk_prefix, Serializable).await?;
		if stage_rows.is_empty() {
			// An empty staging prefix used to be terminal. It now falls through to the probe, which
			// also succeeds against a version some other job wrote at this `(shard, as_of_txid)`, so
			// a staged job whose staging area was cleared early installs against that version rather
			// than rejecting. That is intended and it is safe, but only because a fold is a pure
			// function of its inputs: two jobs folding the same coverage txid from the same watermark
			// produce byte-identical images, so the version found here is the one this job staged.
			// The determinism is the load-bearing part; if folds ever stop being reproducible this
			// has to go back to rejecting.
			if !shard_blob::shard_version_exists(
				tx,
				input.database_branch_id,
				output_ref.shard_id,
				output_ref.as_of_txid,
				Serializable,
			)
			.await?
			{
				return Ok(HotInstallChunkOutcome::Terminal(rejected_hot_install(
					"hot shard image is in neither the staging area nor the shard tier",
				)));
			}
			// Charge the image even though no blob bytes are written. Without this an all-direct
			// chunk can never trip the cap and has no cursor to spill to, so a wide slice would try
			// to publish in a single oversized transaction.
			charged_bytes = charged_bytes.saturating_add(output_ref.size_bytes);
			copied_shard_count += 1;
			continue;
		}

		let staged_blob = shard_blob::assemble_chunked_rows(&stage_chunk_prefix, &stage_rows)?;
		if output_ref.size_bytes != u64::try_from(staged_blob.len()).unwrap_or(u64::MAX)
			|| output_ref.content_hash != content_hash(&staged_blob)
		{
			return Ok(HotInstallChunkOutcome::Terminal(rejected_hot_install(
				"staged hot shard checksum mismatch",
			)));
		}
		shard_blob::write_shard_blob(
			tx,
			input.database_branch_id,
			output_ref.shard_id,
			output_ref.as_of_txid,
			&staged_blob,
		)?;
		charged_bytes = charged_bytes.saturating_add(staged_blob.len() as u64);
		copied_bytes = copied_bytes.saturating_add(staged_blob.len() as u64);
		copied_shard_count += 1;
	}
	#[cfg(feature = "test-faults")]
	test_hooks::install_write_probe::record(copied_bytes);

	if next_shard_cursor.is_some() {
		// This chunk has images left to copy. Hold the txid cursor and publish nothing: the copies
		// committed above are unreferenced shard versions until the chunk's PIDX rows clear, and the
		// watermark still only advances at finalize.
		return Ok(HotInstallChunkOutcome::Continue {
			cursor,
			cursor_segment_pgno,
			shard_cursor: next_shard_cursor,
			copied_shard_count,
			installed_bytes: charged_bytes,
			copied_bytes,
		});
	}

	// Record the fold index alongside the SHARD writes so cold planning can find "oldest fold + its
	// shards" with a `limit=1` range scan instead of scanning the whole `SHARD/*` prefix. Chunks
	// partition the txid range, so every fold is materialized in exactly one chunk. Re-writing the same
	// fold row on a retry is idempotent.
	for (as_of_txid, shard_ids) in folds {
		let commit = tx_get_value(
			tx,
			&keys::branch_commit_key(input.database_branch_id, as_of_txid),
			Serializable,
		)
		.await?
		.as_deref()
		.map(decode_commit_row)
		.transpose()
		.context("decode sqlite commit row for fold index")?
		.context("fold txid is missing its COMMITS row")?;
		// Union with whatever is already recorded. A commit folded across several slices materializes
		// part of its shard set per slice, so overwriting would drop the shards earlier slices wrote
		// and understate the fold. A partial entry is invisible for the same reason its images are:
		// nothing reads the fold index above the hot watermark, and the watermark does not reach a
		// partially folded commit. Re-writing the same set on a retry stays idempotent.
		let mut merged_shard_ids = shard_ids;
		if let Some(existing) = tx_get_value(
			tx,
			&keys::branch_compaction_fold_key(input.database_branch_id, as_of_txid),
			Serializable,
		)
		.await?
		.as_deref()
		.map(decode_fold_index_entry)
		.transpose()
		.context("decode existing sqlite fold index entry")?
		{
			merged_shard_ids.extend(existing.shard_ids);
		}
		let entry = FoldIndexEntry {
			shard_ids: merged_shard_ids.into_iter().collect(),
			versionstamp: commit.versionstamp,
		};
		tx.informal().set(
			&keys::branch_compaction_fold_key(input.database_branch_id, as_of_txid),
			&encode_fold_index_entry(entry).context("encode sqlite fold index entry")?,
		);
	}
	#[cfg(feature = "test-faults")]
	if let Some(output) = hot_install_fault_output(
		input.database_branch_id,
		HotCompactionFaultPoint::InstallAfterShardPublishBeforePidxClear,
	)
	.await?
	{
		return Ok(HotInstallChunkOutcome::Terminal(output));
	}

	// On a retry the chunk's PIDX rows are already cleared, so `pidx_entries` is empty and this
	// validation is a no-op; the staged shards were re-copied above regardless.
	for (key, value) in &hot_inputs.pidx_entries {
		let pgno = decode_branch_pidx_pgno(input.database_branch_id, key)?;
		let shard_id = pgno / keys::SHARD_SIZE;
		if !latest_staged_shards.contains(&shard_id) {
			return Ok(HotInstallChunkOutcome::Terminal(rejected_hot_install(
				"missing staged hot shard for PIDX row",
			)));
		}
		decode_pidx_txid(value)?;
	}

	for (key, value) in &hot_inputs.pidx_entries {
		udb::compare_and_clear(tx, key, value);
	}

	for selection in &hot_inputs.pitr_interval_coverage {
		tx.informal().set(
			&keys::branch_pitr_interval_key(input.database_branch_id, selection.bucket_start_ms),
			&encode_pitr_interval_coverage(selection.coverage.clone())
				.context("encode sqlite PITR interval coverage for hot install")?,
		);
	}

	// A commit installed only in part keeps the txid cursor and advances the page cursor instead, so
	// the next chunk resumes inside it exactly where staging did.
	Ok(match hot_inputs.selected_max_pgno_exclusive {
		Some(next_pgno) => HotInstallChunkOutcome::Continue {
			cursor: selected_max_txid,
			cursor_segment_pgno: Some(next_pgno),
			shard_cursor: None,
			copied_shard_count,
			installed_bytes: charged_bytes,
			copied_bytes,
		},
		None => HotInstallChunkOutcome::Continue {
			cursor: selected_max_txid.saturating_add(1),
			cursor_segment_pgno: None,
			shard_cursor: None,
			copied_shard_count,
			installed_bytes: charged_bytes,
			copied_bytes,
		},
	})
}

async fn install_hot_finalize_tx(
	tx: &universaldb::Transaction,
	input: &InstallHotJobInput,
	target_watermark: u64,
	installed_shard_count: u64,
	installed_shard_bytes: u64,
	copied_shard_bytes: u64,
) -> Result<InstallHotJobOutput> {
	let branch_record = tx_get_value(
		tx,
		&keys::branches_list_key(input.database_branch_id),
		Serializable,
	)
	.await?
	.as_deref()
	.map(decode_database_branch_record)
	.transpose()
	.context("decode sqlite database branch record for hot install finalize")?;
	if !branch_record_is_live_at_generation(branch_record.as_ref(), input.base_lifecycle_generation)
	{
		return Ok(rejected_hot_install("database branch lifecycle changed"));
	}

	let root = read_compaction_root_or_default(tx, input.database_branch_id).await?;
	// A retry after the finalize already committed sees the bumped generation and advanced watermark.
	// Treat that as success so the idempotent install does not reject completed work.
	if root.manifest_generation == input.base_manifest_generation.saturating_add(1)
		&& root.hot_watermark_txid >= target_watermark
	{
		return Ok(InstallHotJobOutput {
			status: CompactionJobStatus::Succeeded,
			resume_cursor: None,
			resume_cursor_segment_pgno: None,
			resume_shard_cursor: None,
			throttled: false,
			installed_shard_count,
			installed_shard_bytes,
			copied_shard_bytes,
		});
	}
	if root.manifest_generation != input.base_manifest_generation {
		return Ok(rejected_hot_install("base manifest generation changed"));
	}

	#[cfg(feature = "test-faults")]
	if let Some(output) = hot_install_fault_output(
		input.database_branch_id,
		HotCompactionFaultPoint::InstallBeforeRootUpdate,
	)
	.await?
	{
		return Ok(output);
	}
	// The whole drain installs as one logical compaction: advance the hot watermark to H0 and bump
	// the generation exactly once after every chunk's shards and PIDX clears are durable.
	let next_root = CompactionRoot {
		schema_version: root.schema_version,
		manifest_generation: root.manifest_generation.saturating_add(1),
		hot_watermark_txid: root.hot_watermark_txid.max(target_watermark),
		cold_watermark_txid: root.cold_watermark_txid,
		cold_watermark_versionstamp: root.cold_watermark_versionstamp,
	};
	tx.informal().set(
		&keys::branch_compaction_root_key(input.database_branch_id),
		&encode_compaction_root(next_root)
			.context("encode sqlite compaction root for hot install")?,
	);
	#[cfg(feature = "test-faults")]
	if let Some(output) = hot_install_fault_output(
		input.database_branch_id,
		HotCompactionFaultPoint::InstallAfterRootUpdate,
	)
	.await?
	{
		return Ok(output);
	}

	Ok(InstallHotJobOutput {
		status: CompactionJobStatus::Succeeded,
		resume_cursor: None,
		resume_cursor_segment_pgno: None,
		resume_shard_cursor: None,
		throttled: false,
		installed_shard_count,
		installed_shard_bytes,
		copied_shard_bytes,
	})
}

fn rejected_hot_install(reason: impl Into<String>) -> InstallHotJobOutput {
	InstallHotJobOutput {
		status: CompactionJobStatus::Rejected {
			reason: reason.into(),
		},
		resume_cursor: None,
		resume_cursor_segment_pgno: None,
		resume_shard_cursor: None,
		throttled: false,
		installed_shard_count: 0,
		installed_shard_bytes: 0,
		copied_shard_bytes: 0,
	}
}

#[cfg(feature = "test-faults")]
async fn hot_install_before_staged_read_fault_output(
	tx: &universaldb::Transaction,
	input: &InstallHotJobInput,
	cursor: u64,
) -> Result<Option<InstallHotJobOutput>> {
	match test_hooks::maybe_fire_hot_compaction_fault(
		input.database_branch_id,
		HotCompactionFaultPoint::InstallBeforeStagedRead,
	)
	.await
	{
		Ok(Some(fired)) if fired.action == DepotFaultAction::DropArtifact => {
			// Drop this chunk's staged shard blobs so the install's re-read finds them missing. The refs
			// are re-derived from the staging area, so scan this slice's refs to find what to clear.
			let chunk_output_refs = read_staged_hot_shard_refs_for_slice(
				tx,
				input.database_branch_id,
				input.job_id,
				cursor,
				Serializable,
			)
			.await?;
			for output_ref in &chunk_output_refs {
				let (stage_begin, stage_end) = keys::branch_compaction_stage_hot_shard_txid_range(
					input.database_branch_id,
					input.job_id,
					output_ref.shard_id,
					output_ref.as_of_txid,
				);
				tx.informal().clear_range(&stage_begin, &stage_end);
			}
			Ok(None)
		}
		Ok(Some(_)) | Ok(None) => Ok(None),
		Err(err) => Ok(Some(failed_hot_install(err))),
	}
}

#[cfg(feature = "test-faults")]
async fn hot_install_fault_output(
	database_branch_id: DatabaseBranchId,
	point: HotCompactionFaultPoint,
) -> Result<Option<InstallHotJobOutput>> {
	match test_hooks::maybe_fire_hot_compaction_fault(database_branch_id, point).await {
		Ok(Some(_)) | Ok(None) => Ok(None),
		Err(err) => Ok(Some(failed_hot_install(err))),
	}
}

#[cfg(feature = "test-faults")]
fn failed_hot_install(err: anyhow::Error) -> InstallHotJobOutput {
	InstallHotJobOutput {
		status: CompactionJobStatus::Failed {
			error: err.to_string(),
		},
		resume_cursor: None,
		resume_cursor_segment_pgno: None,
		resume_shard_cursor: None,
		throttled: false,
		installed_shard_count: 0,
		installed_shard_bytes: 0,
		copied_shard_bytes: 0,
	}
}

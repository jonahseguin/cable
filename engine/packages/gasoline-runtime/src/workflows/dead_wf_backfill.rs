use std::sync::Arc;

use futures_util::FutureExt;
use gas::{db::debug::DatabaseDebug, prelude::*};

pub const BACKFILL_NAME: &str = "gasoline_dead_wf";
const MAX_BACKFILLS: usize = 1000;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Input {}

#[workflow]
pub async fn gasoline_dead_wf_backfill(ctx: &mut WorkflowCtx, _input: &Input) -> Result<()> {
	ctx.loope(None::<Vec<u8>>, |ctx, last_key| {
		async move {
			let res = ctx
				.activity(BackfillChunkInput {
					last_key: last_key.clone(),
				})
				.await?;

			match res {
				BackfillChunkOutput::Continue { new_last_key, .. } => {
					*last_key = Some(new_last_key);
					Ok(Loop::Continue)
				}
				BackfillChunkOutput::Complete { .. } => Ok(Loop::Break(())),
			}
		}
		.boxed()
	})
	.await?;

	ctx.activity(MarkCompleteInput {
		name: BACKFILL_NAME.to_string(),
	})
	.await?;

	Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, Hash)]
struct BackfillChunkInput {
	last_key: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum BackfillChunkOutput {
	Continue {
		new_last_key: Vec<u8>,
		backfill_count: usize,
	},
	Complete {
		backfill_count: usize,
	},
}

#[activity(BackfillChunk)]
async fn backfill_chunk(
	ctx: &ActivityCtx,
	input: &BackfillChunkInput,
) -> Result<BackfillChunkOutput> {
	// Create new db instance with debug trait
	let db = db::DatabaseKv::new(ctx.config().clone(), ctx.pools().clone()).await?
		as Arc<dyn DatabaseDebug + Send + Sync>;

	let (backfill_count, new_last_key) = db
		.backfill_dead_workflows(MAX_BACKFILLS, input.last_key.as_deref())
		.await?;

	tracing::debug!(%backfill_count, "backfilled workflows");

	if let Some(new_last_key) = new_last_key {
		Ok(BackfillChunkOutput::Continue {
			new_last_key,
			backfill_count,
		})
	} else {
		Ok(BackfillChunkOutput::Complete { backfill_count })
	}
}

#[derive(Debug, Clone, Serialize, Deserialize, Hash)]
pub struct MarkCompleteInput {
	pub name: String,
}

#[activity(MarkComplete)]
pub async fn mark_complete(ctx: &ActivityCtx, input: &MarkCompleteInput) -> Result<()> {
	ctx.udb()?
		.txn("backfill_mark_complete", |tx| {
			let name = input.name.clone();
			async move {
				let tx = tx.with_subspace(rivet_types::keys::backfill::subspace());
				tx.write(
					&rivet_types::keys::backfill::CompleteKey::new(&name),
					util::timestamp::now(),
				)?;
				Ok(())
			}
		})
		.custom_instrument(tracing::debug_span!("mark_backfill_complete_tx"))
		.await?;

	tracing::debug!(name = %input.name, "marked backfill as complete");

	Ok(())
}

use std::{
	collections::BTreeMap,
	fs,
	io::{BufReader, Read, Write},
	path::{Path, PathBuf},
	time::{Duration, Instant},
};

use anyhow::{Context, Result, bail, ensure};
use depot::conveyer::{
	constants::{MAX_BUCKET_DEPTH, MAX_FORK_DEPTH},
	keys,
	types::{
		BucketBranchId, BucketId, DatabaseBranchId, decode_bucket_branch_record,
		decode_bucket_pointer, decode_database_branch_record, decode_database_pointer,
	},
};
use futures_util::TryStreamExt;
use gas::prelude::Id;
use rivet_config::config::Database as DatabaseConfig;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use universaldb::{
	Database, RangeOption, Transaction,
	options::StreamingMode,
	utils::IsolationLevel::{Serializable, Snapshot},
};
use uuid::Uuid;

const FORMAT_VERSION: u32 = 2;
const LEGACY_FORMAT_VERSION: u32 = 1;
const EXPORT_SCAN_TX_MAX_KEYS: usize = 256;
const EXPORT_SCAN_TX_MAX_BYTES: usize = 1024 * 1024;
const EXPORT_SCAN_TX_MAX_DURATION: Duration = Duration::from_secs(1);
const IMPORT_BATCH_MAX_KEYS: usize = 400;
const IMPORT_BATCH_MAX_BYTES: usize = 1024 * 1024;
const IMPORT_MAX_KEY_BYTES: usize = 1024 * 1024;
const IMPORT_MAX_VALUE_BYTES: usize = 128 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct ExportTarget {
	pub bucket_id: Id,
	pub database_id: String,
}

#[derive(Debug, Serialize)]
pub struct TransferSummary {
	pub artifact_dir: PathBuf,
	pub bucket_id: Uuid,
	pub database_id: String,
	pub database_branch_ids: Vec<Uuid>,
	pub kv_rows: usize,
	pub kv_bytes: u64,
	pub cold_objects: usize,
	pub cold_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportManifest {
	format_version: u32,
	created_at_unix_ms: u64,
	bucket_id: Uuid,
	database_id: String,
	bucket_branch_ids: Vec<Uuid>,
	database_branch_ids: Vec<Uuid>,
	#[serde(default, skip_serializing_if = "Vec::is_empty")]
	kv: Vec<FileEntry>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	kv_stream: Option<KvStreamEntry>,
	cold: Vec<ColdFileEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct KvStreamEntry {
	data_file: String,
	rows: usize,
	kv_bytes: u64,
	file_bytes: u64,
	sha256: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct FileEntry {
	key_file: String,
	value_file: String,
	key_bytes: u64,
	value_bytes: u64,
	key_sha256: String,
	value_sha256: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ColdFileEntry {
	object_key: String,
	data_file: String,
	bytes: u64,
	sha256: String,
}

struct ExportLayout {
	rows: BTreeMap<Vec<u8>, Vec<u8>>,
	bucket_branch_ids: Vec<BucketBranchId>,
	database_branch_ids: Vec<DatabaseBranchId>,
	ranges: Vec<(Vec<u8>, Vec<u8>)>,
}

struct KvStreamWriter {
	file: fs::File,
	digest: KvStreamDigest,
}

struct KvStreamDigest {
	hasher: Sha256,
	rows: usize,
	kv_bytes: u64,
	file_bytes: u64,
}

impl KvStreamWriter {
	fn create(path: &Path) -> Result<Self> {
		Ok(Self {
			file: create_private_file(path)?,
			digest: KvStreamDigest::new(),
		})
	}

	fn finish(mut self) -> Result<KvStreamEntry> {
		self.file.flush().context("flush streamed KV export")?;
		self.file.sync_all().context("sync streamed KV export")?;
		Ok(self.digest.finish())
	}
}

impl KvStreamDigest {
	fn new() -> Self {
		Self {
			hasher: Sha256::new(),
			rows: 0,
			kv_bytes: 0,
			file_bytes: 0,
		}
	}

	fn record_row(&mut self, key: &[u8], value: &[u8]) -> Result<[u8; 8]> {
		let key_len = u32::try_from(key.len()).context("export key exceeds u32 length")?;
		let value_len = u32::try_from(value.len()).context("export value exceeds u32 length")?;
		let mut header = [0u8; 8];
		header[..4].copy_from_slice(&key_len.to_be_bytes());
		header[4..].copy_from_slice(&value_len.to_be_bytes());
		for bytes in [header.as_slice(), key, value] {
			self.hasher.update(bytes);
			self.file_bytes = self.file_bytes.saturating_add(bytes.len() as u64);
		}
		self.rows = self.rows.saturating_add(1);
		self.kv_bytes = self
			.kv_bytes
			.saturating_add((key.len() + value.len()) as u64);
		Ok(header)
	}

	fn finish(self) -> KvStreamEntry {
		KvStreamEntry {
			data_file: "kv.bin".to_string(),
			rows: self.rows,
			kv_bytes: self.kv_bytes,
			file_bytes: self.file_bytes,
			sha256: hex::encode(self.hasher.finalize()),
		}
	}
}

trait KvRowSink {
	fn write_row(&mut self, key: &[u8], value: &[u8]) -> Result<()>;
}

impl KvRowSink for KvStreamWriter {
	fn write_row(&mut self, key: &[u8], value: &[u8]) -> Result<()> {
		let header = self.digest.record_row(key, value)?;
		for bytes in [header.as_slice(), key, value] {
			self.file
				.write_all(bytes)
				.context("write streamed KV export")?;
		}
		Ok(())
	}
}

impl KvRowSink for KvStreamDigest {
	fn write_row(&mut self, key: &[u8], value: &[u8]) -> Result<()> {
		self.record_row(key, value)?;
		Ok(())
	}
}

pub fn verify_local_import_config(config: &rivet_config::Config) -> Result<()> {
	ensure!(
		matches!(config.database(), DatabaseConfig::FileSystem(_)),
		"Depot import is restricted to the local file_system/RocksDB database backend"
	);
	Ok(())
}

pub fn create_private_export_root(config: &rivet_config::Config, path: &Path) -> Result<()> {
	ensure!(
		!path.exists(),
		"backup path already exists: {}",
		path.display()
	);
	let parent = path.parent().unwrap_or_else(|| Path::new("."));
	fs::create_dir_all(parent)
		.with_context(|| format!("create backup parent {}", parent.display()))?;
	let backup_location = parent
		.canonicalize()
		.with_context(|| format!("resolve backup parent {}", parent.display()))?
		.join(
			path.file_name()
				.context("backup path must have a final component")?,
		);
	let mut protected_locations = Vec::new();
	if let DatabaseConfig::FileSystem(database) = config.database() {
		protected_locations.push(
			database
				.path
				.canonicalize()
				.with_context(|| format!("resolve RocksDB path {}", database.path.display()))?,
		);
	}
	for protected in protected_locations {
		ensure!(
			!backup_location.starts_with(&protected) && !protected.starts_with(&backup_location),
			"backup path must be separate from storage path {}",
			protected.display()
		);
	}
	create_private_dir(path)?;
	sync_directory(parent)?;
	Ok(())
}

pub async fn export_database(
	config: &rivet_config::Config,
	udb: &Database,
	target: ExportTarget,
	output: &Path,
) -> Result<TransferSummary> {
	ensure!(
		!output.exists(),
		"export path already exists: {}",
		output.display()
	);
	let parent = output.parent().unwrap_or_else(|| Path::new("."));
	fs::create_dir_all(parent)
		.with_context(|| format!("create export parent {}", parent.display()))?;
	let file_name = output
		.file_name()
		.and_then(|name| name.to_str())
		.context("export path must have a UTF-8 file name")?;
	let partial = parent.join(format!(".{file_name}.partial-{}", Uuid::new_v4().simple()));
	create_private_dir(&partial)?;

	let result = export_database_inner(config, udb, target, &partial).await;
	let summary = match result {
		Ok(summary) => summary,
		Err(error) => {
			let _ = fs::remove_dir_all(&partial);
			return Err(error);
		}
	};
	fs::rename(&partial, output).with_context(|| {
		format!(
			"publish completed export {} to {}",
			partial.display(),
			output.display()
		)
	})?;
	sync_directory(parent)?;

	Ok(TransferSummary {
		artifact_dir: output.to_path_buf(),
		..summary
	})
}

async fn export_database_inner(
	config: &rivet_config::Config,
	udb: &Database,
	target: ExportTarget,
	output: &Path,
) -> Result<TransferSummary> {
	let bucket_id = BucketId::from_gas_id(target.bucket_id);
	let database_id = target.database_id;
	let layout = udb
		.txn("engine_depot_export_snapshot", {
			let database_id = database_id.clone();
			move |tx| {
				let database_id = database_id.clone();
				async move { collect_layout(&tx, bucket_id, &database_id).await }
			}
		})
		.await
		.context("read database export layout")?;
	let mut kv_writer = KvStreamWriter::create(&output.join("kv.bin"))?;
	for (key, value) in &layout.rows {
		kv_writer.write_row(key, value)?;
	}
	for range in &layout.ranges {
		write_range_paginated(udb, &mut kv_writer, &layout.rows, range.clone()).await?;
	}
	let kv_stream = kv_writer.finish()?;
	let cold_dir = output.join("cold");
	create_private_dir(&cold_dir)?;

	// The manifest keeps its cold fields so a backup taken here still deserializes on a build that
	// has cold storage. There is no cold tier to export from, so they stay empty.
	let cold: Vec<ColdFileEntry> = Vec::new();
	let cold_bytes = 0u64;

	let manifest = ExportManifest {
		format_version: FORMAT_VERSION,
		created_at_unix_ms: std::time::SystemTime::now()
			.duration_since(std::time::UNIX_EPOCH)
			.context("system clock before Unix epoch")?
			.as_millis() as u64,
		bucket_id: bucket_id.as_uuid(),
		database_id: database_id.clone(),
		bucket_branch_ids: layout
			.bucket_branch_ids
			.iter()
			.map(|id| id.as_uuid())
			.collect(),
		database_branch_ids: layout
			.database_branch_ids
			.iter()
			.map(|id| id.as_uuid())
			.collect(),
		kv: Vec::new(),
		kv_stream: Some(kv_stream),
		cold,
	};
	write_private(
		&output.join("manifest.json"),
		&serde_json::to_vec_pretty(&manifest)?,
	)?;
	sync_directory(&cold_dir)?;
	sync_directory(output)?;

	let verified = verify_database_export(
		config,
		udb,
		ExportTarget {
			bucket_id: Id::v1(bucket_id.as_uuid(), 0),
			database_id: database_id.clone(),
		},
		output,
	)
	.await
	.context("verify completed Depot export against source")?;
	ensure!(
		verified.cold_bytes == cold_bytes,
		"verified cold backup byte count changed"
	);

	Ok(TransferSummary {
		artifact_dir: output.to_path_buf(),
		..verified
	})
}

pub async fn verify_database_export(
	_config: &rivet_config::Config,
	udb: &Database,
	target: ExportTarget,
	input: &Path,
) -> Result<TransferSummary> {
	let manifest = verify_export_artifact(input)?;
	let bucket_id = BucketId::from_gas_id(target.bucket_id);
	ensure!(
		manifest.bucket_id == bucket_id.as_uuid(),
		"backup bucket id does not match repair target"
	);
	ensure!(
		manifest.database_id == target.database_id,
		"backup database id does not match repair target"
	);

	let layout = udb
		.txn("engine_depot_export_verify_source_layout", {
			let database_id = target.database_id.clone();
			move |tx| {
				let database_id = database_id.clone();
				async move { collect_layout(&tx, bucket_id, &database_id).await }
			}
		})
		.await
		.context("read database backup verification layout")?;
	ensure!(
		manifest.bucket_branch_ids
			== layout
				.bucket_branch_ids
				.iter()
				.map(|id| id.as_uuid())
				.collect::<Vec<_>>()
			&& manifest.database_branch_ids
				== layout
					.database_branch_ids
					.iter()
					.map(|id| id.as_uuid())
					.collect::<Vec<_>>(),
		"database branch layout changed while backing up"
	);

	let mut digest = KvStreamDigest::new();
	for (key, value) in &layout.rows {
		digest.write_row(key, value)?;
	}
	for range in &layout.ranges {
		write_range_paginated(udb, &mut digest, &layout.rows, range.clone()).await?;
	}
	let source_stream = digest.finish();
	let manifest_stream = manifest
		.kv_stream
		.as_ref()
		.context("verified backup is missing streamed KV metadata")?;
	ensure!(
		&source_stream == manifest_stream,
		"database keyspace changed while backing up; refusing repair"
	);

	// Nothing here writes cold objects, so a manifest that names any came from a build with cold
	// storage and cannot be verified against this one.
	ensure!(
		manifest.cold.is_empty(),
		"backup contains cold objects but cold storage is not available on this build"
	);
	let cold_bytes = 0u64;

	Ok(TransferSummary {
		artifact_dir: input.to_path_buf(),
		bucket_id: manifest.bucket_id,
		database_id: manifest.database_id,
		database_branch_ids: manifest.database_branch_ids,
		kv_rows: manifest_stream.rows,
		kv_bytes: manifest_stream.kv_bytes,
		cold_objects: manifest.cold.len(),
		cold_bytes,
	})
}

pub async fn import_database(
	config: &rivet_config::Config,
	udb: &Database,
	input: &Path,
) -> Result<TransferSummary> {
	verify_local_import_config(config)?;
	let manifest = read_manifest(input)?;
	// A backup that names cold objects came from a build with cold storage. There is nowhere to
	// restore them to here, so refuse rather than import a partial database.
	ensure!(
		manifest.cold.is_empty(),
		"backup contains cold objects but cold storage is not available on this build"
	);
	let cold_bytes = 0u64;

	let (kv_rows, kv_bytes) = if let Some(stream) = &manifest.kv_stream {
		import_kv_stream(udb, input, stream).await?
	} else {
		import_legacy_kv_files(udb, input, &manifest.kv).await?
	};

	Ok(TransferSummary {
		artifact_dir: input.to_path_buf(),
		bucket_id: manifest.bucket_id,
		database_id: manifest.database_id,
		database_branch_ids: manifest.database_branch_ids,
		kv_rows,
		kv_bytes,
		cold_objects: manifest.cold.len(),
		cold_bytes,
	})
}

async fn collect_layout(
	tx: &Transaction,
	bucket_id: BucketId,
	database_id: &str,
) -> Result<ExportLayout> {
	let mut rows = BTreeMap::new();
	let mut ranges = Vec::new();
	let bucket_pointer_key = keys::bucket_pointer_cur_key(bucket_id);
	let bucket_pointer = get_and_collect(tx, &mut rows, bucket_pointer_key)
		.await?
		.map(|value| decode_bucket_pointer(&value))
		.transpose()
		.context("decode bucket pointer")?;
	let mut bucket_branch_id = bucket_pointer
		.map(|pointer| pointer.current_branch)
		.unwrap_or_else(BucketBranchId::nil);
	let mut bucket_branch_ids = Vec::new();
	let database_branch_id = loop {
		ensure!(
			bucket_branch_ids.len() <= MAX_BUCKET_DEPTH as usize,
			"bucket branch ancestry exceeded maximum depth"
		);
		if !bucket_branch_ids.contains(&bucket_branch_id) {
			bucket_branch_ids.push(bucket_branch_id);
		}
		let parent_bucket_branch_id = if bucket_branch_id == BucketBranchId::nil() {
			None
		} else {
			let record_key = keys::bucket_branches_list_key(bucket_branch_id);
			let record_bytes = get_and_collect(tx, &mut rows, record_key)
				.await?
				.with_context(|| format!("missing bucket branch record {bucket_branch_id:?}"))?;
			collect_optional_key(
				tx,
				&mut rows,
				keys::bucket_branches_refcount_key(bucket_branch_id),
			)
			.await?;
			collect_optional_key(
				tx,
				&mut rows,
				keys::bucket_branches_desc_pin_key(bucket_branch_id),
			)
			.await?;
			collect_optional_key(
				tx,
				&mut rows,
				keys::bucket_branches_restore_point_pin_key(bucket_branch_id),
			)
			.await?;
			Some(
				decode_bucket_branch_record(&record_bytes)
					.context("decode bucket branch record")?
					.parent,
			)
		};

		let pointer_key = keys::database_pointer_cur_key(bucket_branch_id, database_id);
		if let Some(value) = get_and_collect(tx, &mut rows, pointer_key).await? {
			break decode_database_pointer(&value)
				.context("decode database pointer")?
				.current_branch;
		}
		if bucket_branch_id == BucketBranchId::nil() {
			bail!("database pointer not found for database {database_id}");
		}

		let tombstone_key =
			keys::bucket_branches_database_name_tombstone_key(bucket_branch_id, database_id);
		if get_and_collect(tx, &mut rows, tombstone_key)
			.await?
			.is_some()
		{
			bail!("database is tombstoned for database {database_id}");
		}
		bucket_branch_id = parent_bucket_branch_id
			.flatten()
			.context("database pointer not found in bucket ancestry")?;
	};

	collect_optional_key(tx, &mut rows, keys::bucket_policy_pitr_key(bucket_id)).await?;
	collect_optional_key(
		tx,
		&mut rows,
		keys::bucket_policy_shard_cache_key(bucket_id),
	)
	.await?;
	collect_optional_key(
		tx,
		&mut rows,
		keys::database_pitr_policy_key(bucket_id, database_id),
	)
	.await?;
	collect_optional_key(
		tx,
		&mut rows,
		keys::database_shard_cache_policy_key(bucket_id, database_id),
	)
	.await?;

	let mut database_branch_ids = Vec::new();
	let mut next_branch_id = Some(database_branch_id);
	while let Some(branch_id) = next_branch_id {
		ensure!(
			database_branch_ids.len() <= MAX_FORK_DEPTH as usize,
			"database branch ancestry exceeded maximum depth"
		);
		ensure!(
			!database_branch_ids.contains(&branch_id),
			"database branch ancestry contained a cycle"
		);
		database_branch_ids.push(branch_id);
		let record_key = keys::branches_list_key(branch_id);
		let record_bytes = get_and_collect(tx, &mut rows, record_key)
			.await?
			.with_context(|| format!("missing database branch record {branch_id:?}"))?;
		collect_optional_key(tx, &mut rows, keys::branches_refcount_key(branch_id)).await?;
		collect_optional_key(tx, &mut rows, keys::branches_desc_pin_key(branch_id)).await?;
		collect_optional_key(
			tx,
			&mut rows,
			keys::branches_restore_point_pin_key(branch_id),
		)
		.await?;
		collect_optional_key(tx, &mut rows, keys::branch_meta_head_key(branch_id)).await?;
		ranges.push(keys::branch_range(branch_id));
		ranges
			.push(universaldb::tuple::Subspace::from_bytes(keys::db_pin_prefix(branch_id)).range());
		let record = decode_database_branch_record(&record_bytes)
			.context("decode database branch record")?;
		next_branch_id = record.parent;
	}

	ranges.push(
		universaldb::tuple::Subspace::from_bytes(keys::restore_point_prefix(database_id)).range(),
	);
	let mut sorted_ranges = ranges.clone();
	sorted_ranges.sort_by(|left, right| left.0.cmp(&right.0));
	for pair in sorted_ranges.windows(2) {
		ensure!(
			pair[0].1 <= pair[1].0,
			"database export ranges overlap and would duplicate KV rows"
		);
	}

	Ok(ExportLayout {
		rows,
		bucket_branch_ids,
		database_branch_ids,
		ranges,
	})
}

async fn get_and_collect(
	tx: &Transaction,
	rows: &mut BTreeMap<Vec<u8>, Vec<u8>>,
	key: Vec<u8>,
) -> Result<Option<Vec<u8>>> {
	let value = tx
		.informal()
		.get(&key, Snapshot)
		.await?
		.map(Vec::<u8>::from);
	if let Some(value) = &value {
		rows.insert(key, value.clone());
	}
	Ok(value)
}

async fn collect_optional_key(
	tx: &Transaction,
	rows: &mut BTreeMap<Vec<u8>, Vec<u8>>,
	key: Vec<u8>,
) -> Result<()> {
	get_and_collect(tx, rows, key).await?;
	Ok(())
}

async fn write_range_paginated<S: KvRowSink>(
	db: &Database,
	writer: &mut S,
	anchor_rows: &BTreeMap<Vec<u8>, Vec<u8>>,
	(begin, end): (Vec<u8>, Vec<u8>),
) -> Result<()> {
	let mut cursor = None;
	loop {
		let page = db
			.txn("engine_depot_export_range_page", {
				let begin = begin.clone();
				let end = end.clone();
				let cursor = cursor.clone();
				move |tx| {
					let begin = begin.clone();
					let end = end.clone();
					let cursor = cursor.clone();
					async move {
						let started_at = Instant::now();
						let begin = cursor
							.map(universaldb::KeySelector::first_greater_than)
							.unwrap_or_else(|| {
								universaldb::KeySelector::first_greater_or_equal(begin)
							});
						let informal = tx.informal();
						let mut stream = informal.get_ranges_keyvalues(
							RangeOption {
								begin,
								end: universaldb::KeySelector::first_greater_or_equal(end),
								limit: Some(EXPORT_SCAN_TX_MAX_KEYS),
								mode: StreamingMode::Iterator,
								..RangeOption::default()
							},
							Snapshot,
						);
						let mut page = Vec::new();
						let mut page_bytes = 0usize;
						while let Some(entry) = stream.try_next().await? {
							let row_bytes = entry.key().len().saturating_add(entry.value().len());
							if !page.is_empty()
								&& (page_bytes.saturating_add(row_bytes) > EXPORT_SCAN_TX_MAX_BYTES
									|| started_at.elapsed() >= EXPORT_SCAN_TX_MAX_DURATION)
							{
								break;
							}
							page_bytes = page_bytes.saturating_add(row_bytes);
							page.push((entry.key().to_vec(), entry.value().to_vec()));
						}
						Ok(page)
					}
				}
			})
			.await
			.context("read database export range page")?;
		if page.is_empty() {
			break;
		}
		cursor = page.last().map(|(key, _)| key.clone());
		for (key, value) in page {
			if !anchor_rows.contains_key(&key) {
				writer.write_row(&key, &value)?;
			}
		}
	}
	Ok(())
}

async fn import_legacy_kv_files(
	udb: &Database,
	input: &Path,
	entries: &[FileEntry],
) -> Result<(usize, u64)> {
	let mut batch = Vec::new();
	let mut batch_bytes = 0usize;
	let mut kv_bytes = 0u64;
	for entry in entries {
		let key = read_verified_file(input, &entry.key_file, entry.key_bytes, &entry.key_sha256)?;
		let value = read_verified_file(
			input,
			&entry.value_file,
			entry.value_bytes,
			&entry.value_sha256,
		)?;
		let row_bytes = key.len() + value.len();
		if !batch.is_empty()
			&& (batch.len() >= IMPORT_BATCH_MAX_KEYS
				|| batch_bytes.saturating_add(row_bytes) > IMPORT_BATCH_MAX_BYTES)
		{
			import_batch(udb, std::mem::take(&mut batch)).await?;
			batch_bytes = 0;
		}
		batch_bytes = batch_bytes.saturating_add(row_bytes);
		kv_bytes = kv_bytes.saturating_add(row_bytes as u64);
		batch.push((key, value));
	}
	if !batch.is_empty() {
		import_batch(udb, batch).await?;
	}
	Ok((entries.len(), kv_bytes))
}

async fn import_kv_stream(
	udb: &Database,
	input: &Path,
	entry: &KvStreamEntry,
) -> Result<(usize, u64)> {
	let path = verified_relative_path(input, &entry.data_file)?;
	let metadata = fs::metadata(&path)
		.with_context(|| format!("read streamed KV metadata {}", path.display()))?;
	ensure!(
		metadata.len() == entry.file_bytes,
		"streamed KV export size mismatch: {}",
		entry.data_file
	);
	let mut verifier = BufReader::new(
		fs::File::open(&path)
			.with_context(|| format!("open streamed KV export {}", path.display()))?,
	);
	let mut hasher = Sha256::new();
	let mut buffer = [0u8; 64 * 1024];
	loop {
		let read = verifier
			.read(&mut buffer)
			.with_context(|| format!("verify streamed KV export {}", path.display()))?;
		if read == 0 {
			break;
		}
		hasher.update(&buffer[..read]);
	}
	ensure!(
		hex::encode(hasher.finalize()) == entry.sha256,
		"streamed KV export hash mismatch: {}",
		entry.data_file
	);

	let mut reader = BufReader::new(
		fs::File::open(&path)
			.with_context(|| format!("open verified streamed KV export {}", path.display()))?,
	);
	let mut batch = Vec::new();
	let mut batch_bytes = 0usize;
	let mut rows = 0usize;
	let mut kv_bytes = 0u64;
	loop {
		let mut header = [0u8; 8];
		let first = reader
			.read(&mut header[..1])
			.context("read streamed KV record header")?;
		if first == 0 {
			break;
		}
		reader
			.read_exact(&mut header[1..])
			.context("read complete streamed KV record header")?;
		let key_bytes = usize::try_from(u32::from_be_bytes(header[..4].try_into().unwrap()))
			.context("streamed KV key length does not fit usize")?;
		let value_bytes = usize::try_from(u32::from_be_bytes(header[4..].try_into().unwrap()))
			.context("streamed KV value length does not fit usize")?;
		ensure!(
			key_bytes <= IMPORT_MAX_KEY_BYTES,
			"streamed KV key is too large"
		);
		ensure!(
			value_bytes <= IMPORT_MAX_VALUE_BYTES,
			"streamed KV value is too large"
		);
		let mut key = vec![0u8; key_bytes];
		let mut value = vec![0u8; value_bytes];
		reader
			.read_exact(&mut key)
			.context("read streamed KV key")?;
		reader
			.read_exact(&mut value)
			.context("read streamed KV value")?;
		let row_bytes = key_bytes.saturating_add(value_bytes);
		if !batch.is_empty()
			&& (batch.len() >= IMPORT_BATCH_MAX_KEYS
				|| batch_bytes.saturating_add(row_bytes) > IMPORT_BATCH_MAX_BYTES)
		{
			import_batch(udb, std::mem::take(&mut batch)).await?;
			batch_bytes = 0;
		}
		batch_bytes = batch_bytes.saturating_add(row_bytes);
		kv_bytes = kv_bytes.saturating_add(row_bytes as u64);
		rows = rows.saturating_add(1);
		batch.push((key, value));
	}
	if !batch.is_empty() {
		import_batch(udb, batch).await?;
	}
	ensure!(rows == entry.rows, "streamed KV row count mismatch");
	ensure!(
		kv_bytes == entry.kv_bytes,
		"streamed KV logical byte count mismatch"
	);
	Ok((rows, kv_bytes))
}

async fn import_batch(udb: &Database, batch: Vec<(Vec<u8>, Vec<u8>)>) -> Result<()> {
	udb.txn("engine_depot_import_batch", move |tx| {
		let batch = batch.clone();
		async move {
			for (key, _) in &batch {
				ensure!(
					tx.informal().get(key, Serializable).await?.is_none(),
					"refusing to overwrite an existing local key {}",
					hex::encode(key)
				);
			}
			for (key, value) in batch {
				tx.informal().set(&key, &value);
			}
			Ok(())
		}
	})
	.await
	.context("write local KV batch")
}

fn read_manifest(input: &Path) -> Result<ExportManifest> {
	let path = input.join("manifest.json");
	let bytes = fs::read(&path).with_context(|| format!("read manifest {}", path.display()))?;
	let manifest: ExportManifest =
		serde_json::from_slice(&bytes).context("decode export manifest")?;
	ensure!(
		matches!(
			manifest.format_version,
			LEGACY_FORMAT_VERSION | FORMAT_VERSION
		),
		"unsupported Depot export format version {}",
		manifest.format_version
	);
	match manifest.format_version {
		LEGACY_FORMAT_VERSION => ensure!(
			manifest.kv_stream.is_none(),
			"legacy Depot export unexpectedly contains a KV stream"
		),
		FORMAT_VERSION => ensure!(
			manifest.kv.is_empty() && manifest.kv_stream.is_some(),
			"streamed Depot export has an invalid KV payload shape"
		),
		_ => unreachable!("format version checked above"),
	}
	Ok(manifest)
}

fn verify_export_artifact(input: &Path) -> Result<ExportManifest> {
	let manifest = read_manifest(input)?;
	if let Some(stream) = &manifest.kv_stream {
		let path = verified_relative_path(input, &stream.data_file)?;
		let metadata = fs::metadata(&path)
			.with_context(|| format!("read streamed KV metadata {}", path.display()))?;
		ensure!(
			metadata.len() == stream.file_bytes,
			"streamed KV backup size mismatch"
		);
		let mut reader = BufReader::new(
			fs::File::open(&path)
				.with_context(|| format!("open streamed KV backup {}", path.display()))?,
		);
		let mut digest = KvStreamDigest::new();
		loop {
			let mut header = [0u8; 8];
			let first = reader
				.read(&mut header[..1])
				.context("read backed-up KV record header")?;
			if first == 0 {
				break;
			}
			reader
				.read_exact(&mut header[1..])
				.context("read complete backed-up KV record header")?;
			let key_bytes = usize::try_from(u32::from_be_bytes(header[..4].try_into().unwrap()))
				.context("backed-up KV key length does not fit usize")?;
			let value_bytes = usize::try_from(u32::from_be_bytes(header[4..].try_into().unwrap()))
				.context("backed-up KV value length does not fit usize")?;
			ensure!(
				key_bytes <= IMPORT_MAX_KEY_BYTES,
				"backed-up KV key is too large"
			);
			ensure!(
				value_bytes <= IMPORT_MAX_VALUE_BYTES,
				"backed-up KV value is too large"
			);
			let mut key = vec![0u8; key_bytes];
			let mut value = vec![0u8; value_bytes];
			reader
				.read_exact(&mut key)
				.context("read backed-up KV key")?;
			reader
				.read_exact(&mut value)
				.context("read backed-up KV value")?;
			digest.write_row(&key, &value)?;
		}
		ensure!(
			digest.finish() == *stream,
			"streamed KV backup content verification failed"
		);
	} else {
		for entry in &manifest.kv {
			read_verified_file(input, &entry.key_file, entry.key_bytes, &entry.key_sha256)?;
			read_verified_file(
				input,
				&entry.value_file,
				entry.value_bytes,
				&entry.value_sha256,
			)?;
		}
	}
	for entry in &manifest.cold {
		read_verified_file(input, &entry.data_file, entry.bytes, &entry.sha256)?;
	}
	Ok(manifest)
}

fn read_verified_file(input: &Path, relative: &str, size: u64, hash: &str) -> Result<Vec<u8>> {
	let path = verified_relative_path(input, relative)?;
	let bytes =
		fs::read(&path).with_context(|| format!("read artifact file {}", path.display()))?;
	ensure!(
		bytes.len() as u64 == size,
		"artifact size mismatch: {relative}"
	);
	ensure!(
		sha256_hex(&bytes) == hash,
		"artifact hash mismatch: {relative}"
	);
	Ok(bytes)
}

fn verified_relative_path(input: &Path, relative: &str) -> Result<PathBuf> {
	let relative_path = Path::new(relative);
	ensure!(
		relative_path
			.components()
			.all(|component| matches!(component, std::path::Component::Normal(_))),
		"artifact path is not relative and normalized: {relative}"
	);
	Ok(input.join(relative_path))
}

fn sha256_hex(bytes: &[u8]) -> String {
	hex::encode(Sha256::digest(bytes))
}

fn create_private_dir(path: &Path) -> Result<()> {
	fs::create_dir(path).with_context(|| format!("create private directory {}", path.display()))?;
	#[cfg(unix)]
	{
		use std::os::unix::fs::PermissionsExt;
		fs::set_permissions(path, fs::Permissions::from_mode(0o700))
			.with_context(|| format!("set private permissions on {}", path.display()))?;
	}
	Ok(())
}

fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
	let mut file = create_private_file(path)?;
	file.write_all(bytes)
		.with_context(|| format!("write private file {}", path.display()))?;
	file.sync_all()
		.with_context(|| format!("sync private file {}", path.display()))?;
	Ok(())
}

fn create_private_file(path: &Path) -> Result<fs::File> {
	let mut options = fs::OpenOptions::new();
	options.create_new(true).write(true);
	#[cfg(unix)]
	{
		use std::os::unix::fs::OpenOptionsExt;
		options.mode(0o600);
	}
	options
		.open(path)
		.with_context(|| format!("create private file {}", path.display()))
}

fn sync_directory(path: &Path) -> Result<()> {
	fs::File::open(path)
		.with_context(|| format!("open directory for sync {}", path.display()))?
		.sync_all()
		.with_context(|| format!("sync directory {}", path.display()))
}

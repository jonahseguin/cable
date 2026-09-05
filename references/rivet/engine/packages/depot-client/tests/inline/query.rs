	use super::*;
	use libsqlite3_sys::{sqlite3_close, sqlite3_open};

	struct MemoryDb(*mut sqlite3);

	impl MemoryDb {
		fn open() -> Self {
			let name = CString::new(":memory:").unwrap();
			let mut db = ptr::null_mut();
			let rc = unsafe { sqlite3_open(name.as_ptr(), &mut db) };
			assert_eq!(rc, SQLITE_OK);
			Self(db)
		}

		fn as_ptr(&self) -> *mut sqlite3 {
			self.0
		}
	}

	impl Drop for MemoryDb {
		fn drop(&mut self) {
			unsafe {
				sqlite3_close(self.0);
			}
		}
	}

	#[test]
	fn run_and_query_bind_typed_params() {
		let db = MemoryDb::open();
		exec_statements(
			db.as_ptr(),
			"CREATE TABLE items(id INTEGER PRIMARY KEY, label TEXT, score REAL, payload BLOB);",
		)
		.unwrap();

		let result = execute_statement(
			db.as_ptr(),
			"INSERT INTO items(label, score, payload) VALUES (?, ?, ?);",
			Some(&[
				BindParam::Text("alpha".to_owned()),
				BindParam::Float(3.5),
				BindParam::Blob(vec![1, 2, 3]),
			]),
		)
		.unwrap();
		assert_eq!(result.changes, 1);

		let rows = query_statement(
			db.as_ptr(),
			"SELECT id, label, score, payload FROM items WHERE label = ?;",
			Some(&[BindParam::Text("alpha".to_owned())]),
		)
		.unwrap();
		assert_eq!(rows.columns, vec!["id", "label", "score", "payload"]);
		assert_eq!(
			rows.rows,
			vec![vec![
				ColumnValue::Integer(1),
				ColumnValue::Text("alpha".to_owned()),
				ColumnValue::Float(3.5),
				ColumnValue::Blob(vec![1, 2, 3]),
			]]
		);
	}

	#[test]
	fn exec_returns_last_statement_rows() {
		let db = MemoryDb::open();
		let result = exec_statements(
			db.as_ptr(),
			"CREATE TABLE items(id INTEGER); INSERT INTO items VALUES (1), (2); SELECT COUNT(*) AS count FROM items;",
		)
		.unwrap();

		assert_eq!(result.columns, vec!["count"]);
		assert_eq!(result.rows, vec![vec![ColumnValue::Integer(2)]]);
	}

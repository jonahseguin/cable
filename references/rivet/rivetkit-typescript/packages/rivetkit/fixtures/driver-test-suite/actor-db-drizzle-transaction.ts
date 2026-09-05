import { actor } from "rivetkit";
import { db, integer, sqliteTable, text } from "@/db/drizzle";
import { migrations } from "./db/migrations";

let rollbackMigrationAttempts = 0;

const testData = sqliteTable("test_data", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	value: text("value").notNull(),
	payload: text("payload").notNull().default(""),
	createdAt: integer("created_at").notNull(),
});

export const dbActorDrizzleMigration = actor({
	db: db({ migrations, schema: { testData } }),
	actions: {
		migrationCommitted: async (c) => {
			const rows = await c.db.execute<{ name: string }>(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'test_data'",
			);
			return rows.length === 1;
		},
		queryBuilderTransaction: async (c) => {
			await c.db.delete(testData);
			let inside: string[] = [];
			try {
				await c.db.transaction(async (tx) => {
					await tx.insert(testData).values({
						value: "query-builder",
						payload: "",
						createdAt: Date.now(),
					});
					inside = (await tx.select().from(testData)).map(
						(row) => row.value,
					);
					throw new Error("expected query-builder rollback");
				});
			} catch (error) {
				if (
					!(error instanceof Error) ||
					error.message !== "expected query-builder rollback"
				) {
					throw error;
				}
			}
			const after = (await c.db.select().from(testData)).map(
				(row) => row.value,
			);
			return { inside, after };
		},
	},
});

export const dbActorDrizzleMigrationRollback = actor({
	db: db({
		onMigrate: async (database) => {
			const existing = await database.execute<{ name: string }>(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_probe'",
			);
			await database.execute(
				"CREATE TABLE migration_probe(value INTEGER)",
			);
			rollbackMigrationAttempts += 1;
			if (rollbackMigrationAttempts === 1) {
				throw new Error("intentional drizzle migration failure");
			}
			await database.execute(
				"CREATE TABLE migration_audit(rolled_back INTEGER NOT NULL)",
			);
			await database.execute(
				"INSERT INTO migration_audit(rolled_back) VALUES (?)",
				existing.length === 0 ? 1 : 0,
			);
		},
	}),
	actions: {
		migrationRolledBack: async (c) => {
			const rows = await c.db.execute<{ rolled_back: number }>(
				"SELECT rolled_back FROM migration_audit",
			);
			return rows[0]?.rolled_back === 1;
		},
	},
});

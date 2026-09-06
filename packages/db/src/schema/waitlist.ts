import { mysqlTable, serial, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const waitlist = mysqlTable('waitlist', {
  id: serial().primaryKey(),
  email: varchar({ length: 255 }).notNull().unique(),
  username: varchar({ length: 255 }),
  avatarUrl: varchar({ length: 1000 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

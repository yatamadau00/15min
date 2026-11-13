import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const items = sqliteTable('planner_items', {id:text('id').primaryKey(),owner:text('owner').notNull(),data:text('data').notNull()});

import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { installations } from '../installations/installations.schema.js';
import { devices } from '../devices/devices.schema.js';

export const sectorsStatus = pgEnum('sectors_status', ['active', 'inactive']);

export const sectors = pgTable(
  'sectors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => installations.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull().unique(),
    description: varchar('description', { length: 255 }),

    status: sectorsStatus('status').notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('sectors_installation_id_idx').on(table.installationId)],
);

export const sectorsRelations = relations(sectors, ({ one, many }) => ({
  devices: many(devices),
  installation: one(installations, {
    fields: [sectors.installationId],
    references: [installations.id],
  }),
}));

import {
  pgTable,
  varchar,
  index,
  timestamp,
  pgEnum,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sectors } from '../sectors/sectors.schema.js';

export const devicesTypes = pgEnum('devices_types', [
  'ac',
  'dc',
  'env',
  'act',
  'adv',
]);
export const devicesStatus = pgEnum('devices_status', ['active', 'inactive']);

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => sectors.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    devicesType: devicesTypes('devices_type').notNull(),
    serialNumber: varchar('serial_number', { length: 255 }),
    version: varchar('version', { length: 255 }),
    macAddress: varchar('mac_address', { length: 255 }),

    status: devicesStatus('status').notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [index('devices_sector_id_idx').on(table.sectorId)],
);

export const devicesRelations = relations(devices, ({ one }) => ({
  sector: one(sectors, {
    fields: [devices.sectorId],
    references: [sectors.id],
  }),
}));

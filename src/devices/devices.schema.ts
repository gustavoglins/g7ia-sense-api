import {
  pgTable,
  varchar,
  index,
  timestamp,
  pgEnum,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sectors } from '../sectors/sectors.schema.js';
import {
  telemetryAc,
  telemetryDc,
  telemetryEnv,
} from '../telemetry/telemetry.schema.js';

export const devicesTypes = pgEnum('devices_types', [
  'ac',
  'dc',
  'env',
  'act',
  'adv',
]);
export const devicesStatus = pgEnum('devices_status', ['active', 'inactive']);
export const deviceApiKeyType = pgEnum('device_api_key_type', [
  'read',
  'write',
]);

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
  },
  (table) => [index('devices_sector_id_idx').on(table.sectorId)],
);

export const deviceApiKeys = pgTable(
  'device_api_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    type: deviceApiKeyType('type').notNull(),
    apiKey: varchar('api_key', { length: 128 }).notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('device_api_keys_device_type_unique').on(
      table.deviceId,
      table.type,
    ),
  ],
);

export const devicesRelations = relations(devices, ({ one, many }) => ({
  apiKeys: many(deviceApiKeys),
  telemetryAc: many(telemetryAc),
  telemetryDc: many(telemetryDc),
  telemetryEnv: many(telemetryEnv),
  sector: one(sectors, {
    fields: [devices.sectorId],
    references: [sectors.id],
  }),
}));

export const deviceApiKeysRelations = relations(deviceApiKeys, ({ one }) => ({
  device: one(devices, {
    fields: [deviceApiKeys.deviceId],
    references: [devices.id],
  }),
}));

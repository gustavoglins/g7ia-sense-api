import { relations } from 'drizzle-orm';
import { pgTable, uuid, timestamp, text, index } from 'drizzle-orm/pg-core';
import { devices } from '../devices/devices.schema.js';

const common = () => ({
  id: uuid('id').defaultRandom().primaryKey(),
  time: timestamp('time', { withTimezone: true }).notNull(),
  deviceId: uuid('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const telemetryAc = pgTable(
  'telemetry_ac',
  {
    ...common(),
    v1: text('v1'),
    a1: text('a1'),
    fp1: text('fp1'),
    rssi: text('rssi'),
  },
  (table) => [
    index('telemetry_ac_device_time_idx').on(table.deviceId, table.time),
  ],
);
export const telemetryAcRelations = relations(telemetryAc, ({ one }) => ({
  device: one(devices, {
    fields: [telemetryAc.deviceId],
    references: [devices.id],
  }),
}));

export const telemetryEnv = pgTable(
  'telemetry_env',
  {
    ...common(),
    temp: text('temp'),
    humidity: text('humidity'),
    solar: text('solar'),
    light: text('light'),
    wind: text('wind'),
    h2: text('h2'),
    rssi: text('rssi'),
  },
  (table) => [
    index('telemetry_env_device_time_idx').on(table.deviceId, table.time),
  ],
);
export const telemetryEnvRelations = relations(telemetryEnv, ({ one }) => ({
  device: one(devices, {
    fields: [telemetryEnv.deviceId],
    references: [devices.id],
  }),
}));

export const telemetryDc = pgTable(
  'telemetry_dc',
  {
    ...common(),
    vdc1: text('vdc1'),
    cc1: text('cc1'),
    vdc2: text('vdc2'),
    cc2: text('cc2'),
    vdc3: text('vdc3'),
    cc3: text('cc3'),
    rssi: text('rssi'),
  },
  (table) => [
    index('telemetry_dc_device_time_idx').on(table.deviceId, table.time),
  ],
);
export const telemetryDcRelations = relations(telemetryDc, ({ one }) => ({
  device: one(devices, {
    fields: [telemetryDc.deviceId],
    references: [devices.id],
  }),
}));

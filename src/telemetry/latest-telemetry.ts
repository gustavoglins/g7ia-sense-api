import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { devices } from '../devices/devices.schema.js';
import { telemetryAc, telemetryDc, telemetryEnv } from './telemetry.schema.js';

export type LatestTelemetry =
  | typeof telemetryAc.$inferSelect
  | typeof telemetryDc.$inferSelect
  | typeof telemetryEnv.$inferSelect;

const tables = { ac: telemetryAc, dc: telemetryDc, env: telemetryEnv };

// Call only after applying company authorization, filters and pagination.
export async function withLatestTelemetry<
  T extends Pick<typeof devices.$inferSelect, 'id' | 'deviceType'>,
>(db: NodePgDatabase, records: T[]) {
  const byDevice = new Map<string, LatestTelemetry>();
  await Promise.all(
    Object.entries(tables).map(async ([type, table]) => {
      const ids = records
        .filter((device) => device.deviceType === type)
        .map((device) => device.id);
      if (!ids.length) return;

      // One query per type, using an indexed LIMIT 1 lookup per device inside
      // PostgreSQL. The full history is never transferred to the application.
      const latest = db
        .select()
        .from(table)
        .where(eq(table.deviceId, devices.id))
        .orderBy(desc(table.time), desc(table.createdAt), desc(table.id))
        .limit(1)
        .as('latest_telemetry');
      const rows = await db
        .select()
        .from(devices)
        .innerJoinLateral(latest, sql`true`)
        .where(inArray(devices.id, ids));
      for (const { latest_telemetry: telemetry } of rows) {
        byDevice.set(telemetry.deviceId, telemetry);
      }
    }),
  );
  return records.map((device) => ({
    ...device,
    latestTelemetry: byDevice.get(device.id) ?? null,
  }));
}

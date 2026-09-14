import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { MetricsPeriod } from './metrics-period.js';

export const SAMPLING_INTERVAL_SECONDS = 15;

type EnergyAggregate = {
  value: number | null;
  validSamples: number;
  invalidSamples: number;
  duplicateSamples: number;
};

// Bound decimal input before casting: telemetry accepts arbitrary strings.
// No implicit conversion of null/empty text to zero, nor invalid PF to 1.
const decimal = (column: 'v1' | 'a1' | 'fp1') => sql`
  CASE WHEN length(btrim(${sql.identifier(column)})) BETWEEN 1 AND 64
    AND btrim(${sql.identifier(column)}) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$'
  THEN btrim(${sql.identifier(column)})::numeric ELSE NULL END`;

// Aggregate in PostgreSQL instead of loading the installation's history in Node.
// Call only after checking the installation's existence and company permissions.
export async function energyConsumption(
  db: NodePgDatabase,
  installationId: string,
  period: MetricsPeriod,
) {
  const result = await db.execute<EnergyAggregate>(sql`
    WITH scoped AS (
      SELECT t.id, t.device_id, t.time, t.created_at, t.v1, t.a1, t.fp1,
        row_number() OVER (
          PARTITION BY t.device_id, t.time ORDER BY t.created_at DESC, t.id DESC
        ) AS position
      FROM telemetry_ac t
      JOIN devices d ON d.id = t.device_id
      JOIN sectors s ON s.id = d.sector_id
      WHERE s.installation_id = ${installationId}::uuid
        AND d.device_type = 'ac'
        AND t.time >= ${period.from.toISOString()}::timestamptz
        AND t.time < ${period.to.toISOString()}::timestamptz
    ), parsed AS (
      SELECT ${decimal('v1')} AS voltage, ${decimal('a1')} AS current,
        ${decimal('fp1')} AS power_factor
      FROM scoped WHERE position = 1
    ), readings AS (
      SELECT *, coalesce(voltage >= 0 AND current >= 0 AND power_factor BETWEEN 0 AND 1, false) AS valid
      FROM parsed
    )
    SELECT round(sum(voltage * current * power_factor * ${SAMPLING_INTERVAL_SECONDS}::numeric / 3600000)
        FILTER (WHERE valid), 6)::double precision AS value,
      (count(*) FILTER (WHERE valid))::double precision AS "validSamples",
      (count(*) FILTER (WHERE NOT valid))::double precision AS "invalidSamples",
      ((SELECT count(*) FROM scoped) - count(*))::double precision AS "duplicateSamples"
    FROM readings
  `);
  return {
    ...result.rows[0],
    unit: 'kWh' as const,
    estimated: true,
    samplingIntervalSeconds: SAMPLING_INTERVAL_SECONDS,
  };
}

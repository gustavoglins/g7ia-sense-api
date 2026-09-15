import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { energyConsumption } from '../energy-consumption.js';

// Uses only session-local temporary tables in an explicitly provided test DB.
// Never reads DATABASE_URL or modifies the application's tables.
describe.skipIf(!process.env.METRICS_TEST_DATABASE_URL)(
  'AC energy aggregation (PostgreSQL)',
  () => {
    const client = new Client({
      connectionString: process.env.METRICS_TEST_DATABASE_URL,
    });
    const db = drizzle(client);
    const installation = randomUUID();
    const sector = randomUUID();
    const device = randomUUID();
    const secondDevice = randomUUID();
    const foreignDevice = randomUUID();
    const dcDevice = randomUUID();
    const period = {
      from: new Date('2026-09-13T00:00:00Z'),
      to: new Date('2026-09-14T00:00:00Z'),
    };

    beforeAll(async () => {
      await client.connect();
      await client.query(`
      CREATE TEMP TABLE sectors (id uuid PRIMARY KEY, installation_id uuid NOT NULL);
      CREATE TEMP TABLE devices (id uuid PRIMARY KEY, sector_id uuid NOT NULL, device_type text NOT NULL, status text DEFAULT 'active');
      CREATE TEMP TABLE telemetry_ac (id uuid PRIMARY KEY, device_id uuid NOT NULL, time timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), v1 text, a1 text, fp1 text);
    `);
      const foreignSector = randomUUID();
      await client.query('INSERT INTO sectors VALUES ($1,$2),($3,$4)', [
        sector,
        installation,
        foreignSector,
        randomUUID(),
      ]);
      await client.query(
        "INSERT INTO devices (id,sector_id,device_type,status) VALUES ($1,$2,'ac','active'),($3,$2,'ac','inactive'),($4,$5,'ac','active'),($6,$2,'dc','active')",
        [device, sector, secondDevice, foreignDevice, foreignSector, dcDevice],
      );
    });
    beforeEach(async () => {
      await client.query('TRUNCATE pg_temp.telemetry_ac');
    });
    afterAll(async () => {
      await client.end();
    });

    async function reading(
      values: {
        deviceId?: string;
        time?: string;
        v1?: string | null;
        a1?: string | null;
        fp1?: string | null;
        id?: string;
        createdAt?: string;
      } = {},
    ) {
      await client.query(
        'INSERT INTO telemetry_ac(id,device_id,time,created_at,v1,a1,fp1) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
          values.id ?? randomUUID(),
          values.deviceId ?? device,
          values.time ?? '2026-09-13T12:00:00Z',
          values.createdAt ?? '2026-09-13T12:00:01Z',
          values.v1 === undefined ? '200' : values.v1,
          values.a1 === undefined ? '5' : values.a1,
          values.fp1 === undefined ? '1' : values.fp1,
        ],
      );
    }

    it('converts 240 samples of 1000 W into 1 kWh', async () => {
      await client.query(
        "INSERT INTO telemetry_ac SELECT gen_random_uuid(), $1, $2::timestamptz + n * interval '15 seconds', now(), '200','5','1' FROM generate_series(0,239) n",
        [device, period.from],
      );
      expect(await energyConsumption(db, installation, period)).toMatchObject({
        value: 1,
        validSamples: 240,
        invalidSamples: 0,
        duplicateSamples: 0,
      });
    });

    it('sums independent AC devices, including inactive history, but not other installations or DC', async () => {
      for (const deviceId of [device, secondDevice, foreignDevice, dcDevice])
        await reading({ deviceId, fp1: '0.5' });
      expect(await energyConsumption(db, installation, period)).toMatchObject({
        value: 0.004167,
        validSamples: 2,
      });
    });

    it('uses a half-open time interval and never fills missing sampling periods', async () => {
      for (const time of [
        '2026-09-12T23:59:59Z',
        '2026-09-13T00:00:00Z',
        '2026-09-13T23:59:45Z',
        '2026-09-14T00:00:00Z',
      ])
        await reading({ time });
      expect(await energyConsumption(db, installation, period)).toMatchObject({
        value: 0.008333,
        validSamples: 2,
      });
    });

    it('deduplicates device/time deterministically by created_at then id', async () => {
      await reading({ v1: '900', createdAt: '2026-09-13T12:00:00Z' });
      await reading({ v1: '400', id: '00000000-0000-4000-8000-000000000001' });
      await reading({ v1: '200', id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });
      expect(await energyConsumption(db, installation, period)).toMatchObject({
        value: 0.004167,
        validSamples: 1,
        duplicateSamples: 2,
      });
    });

    it('rejects null, empty, malformed, excessively long and physically invalid samples without casting errors', async () => {
      const invalid = [
        { v1: null },
        { a1: '' },
        { fp1: null },
        { v1: '220V' },
        { v1: '1,23' },
        { a1: 'NaN' },
        { a1: 'Infinity' },
        { v1: '9'.repeat(1000) },
        { fp1: '1.01' },
        { fp1: '-0.1' },
        { a1: '-1' },
        { v1: '1e9999999' },
        { v1: "1'; drop table devices;--" },
      ];
      for (let i = 0; i < invalid.length; i++)
        await reading({
          ...invalid[i],
          time: new Date(period.from.getTime() + i * 15000).toISOString(),
        });
      expect(await energyConsumption(db, installation, period)).toMatchObject({
        value: null,
        validSamples: 0,
        invalidSamples: invalid.length,
      });
    });

    it('distinguishes no data from measured zero and accepts decimal whitespace', async () => {
      expect(await energyConsumption(db, installation, period)).toMatchObject({
        value: null,
        validSamples: 0,
        invalidSamples: 0,
        duplicateSamples: 0,
      });
      await reading({ a1: ' 0 ', fp1: '.98' });
      expect(await energyConsumption(db, installation, period)).toMatchObject({
        value: 0,
        validSamples: 1,
      });
    });

    it('does not revive an older valid reading when the latest duplicate is invalid', async () => {
      await reading();
      await reading({ fp1: null, createdAt: '2026-09-13T12:00:02Z' });
      expect(await energyConsumption(db, installation, period)).toMatchObject({
        value: null,
        validSamples: 0,
        invalidSamples: 1,
        duplicateSamples: 1,
      });
    });
  },
);

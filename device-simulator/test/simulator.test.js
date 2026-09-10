import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  generateAcTelemetry,
  generateDcTelemetry,
  generateEnvTelemetry,
  INTERVAL_MS,
  loadDeviceConfig,
  resolveEnabledDevices,
  sendTelemetry,
} from '../src/index.js';

describe('device simulator', () => {
  it('uses a fixed interval of 15 seconds', () => {
    assert.equal(INTERVAL_MS, 15_000);
  });

  it('configures one AC, one DC and one ENV device from the API seed', async () => {
    const devices = await loadDeviceConfig();
    assert.deepEqual(
      devices.map(({ name, devicesType, serialNumber }) => ({
        name,
        devicesType,
        serialNumber,
      })),
      [
        {
          name: 'Medidor inicial',
          devicesType: 'ac',
          serialNumber: 'DEMO-G7I-001',
        },
        {
          name: 'Medidor DC',
          devicesType: 'dc',
          serialNumber: 'DEMO-G7I-DC-001',
        },
        {
          name: 'Sensor ambiental',
          devicesType: 'env',
          serialNumber: 'DEMO-G7I-ENV-001',
        },
      ],
    );
  });

  it('enables devices independently and requires only their keys', async () => {
    const devices = await loadDeviceConfig();
    assert.deepEqual(
      resolveEnabledDevices(devices, {
        DEVICE_AC_ENABLED: 'false',
        DEVICE_DC_ENABLED: 'true',
        DEVICE_DC_WRITE_API_KEY: 'dc-key',
        DEVICE_ENV_ENABLED: 'false',
      }),
      [{ device: devices[1], writeKey: 'dc-key' }],
    );
    assert.throws(
      () =>
        resolveEnabledDevices(devices, {
          DEVICE_AC_ENABLED: 'false',
          DEVICE_DC_ENABLED: 'false',
          DEVICE_ENV_ENABLED: 'true',
        }),
      /DEVICE_ENV_WRITE_API_KEY/,
    );
  });

  it('generates the fields expected by each telemetry table', () => {
    const time = new Date('2026-09-09T18:00:00.000Z');
    assert.deepEqual(
      generateAcTelemetry(() => 0, time),
      {
        time: time.toISOString(),
        v1: '215.00',
        a1: '0.00',
        fp1: '0.850',
        rssi: '-90',
      },
    );
    assert.deepEqual(
      generateDcTelemetry(() => 0, time),
      {
        time: time.toISOString(),
        vdc1: '11.50',
        cc1: '0.00',
        vdc2: '11.50',
        cc2: '0.00',
        vdc3: '11.50',
        cc3: '0.00',
        rssi: '-90',
      },
    );
    assert.deepEqual(
      generateEnvTelemetry(() => 0, time),
      {
        time: time.toISOString(),
        temp: '15.00',
        humidity: '20.00',
        solar: '0.00',
        light: '0.00',
        wind: '0.00',
        h2: '0.00',
        rssi: '-90',
      },
    );
  });

  it('posts telemetry using only the matching WRITE header', async () => {
    const telemetry = generateAcTelemetry(
      () => 0.5,
      new Date('2026-09-09T18:00:00.000Z'),
    );
    const fetchImplementation = mock.fn(async () =>
      Response.json({ id: 'telemetry-id' }, { status: 201 }),
    );

    const result = await sendTelemetry({
      apiUrl: 'http://localhost:3000/api/telemetry',
      writeKey: 'g7_write_secret',
      telemetry,
      fetchImplementation,
    });

    assert.deepEqual(result, { id: 'telemetry-id' });
    assert.equal(fetchImplementation.mock.callCount(), 1);
    const [url, options] = fetchImplementation.mock.calls[0].arguments;
    assert.equal(url, 'http://localhost:3000/api/telemetry');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-API-Key'], 'g7_write_secret');
    assert.deepEqual(JSON.parse(options.body), telemetry);
    assert.equal(options.body.includes('g7_write_secret'), false);
  });
});

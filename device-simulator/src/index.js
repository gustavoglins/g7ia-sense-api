import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const INTERVAL_MS = 15_000;
export const REQUEST_TIMEOUT_MS = 10_000;

const generators = {
  ac: generateAcTelemetry,
  dc: generateDcTelemetry,
  env: generateEnvTelemetry,
};

export async function loadDeviceConfig(
  url = new URL('../device.config.json', import.meta.url),
) {
  const config = JSON.parse(await readFile(url, 'utf8'));
  if (!config || typeof config !== 'object' || !Array.isArray(config.devices)) {
    throw new Error('device.config.json deve conter a lista devices.');
  }

  const types = new Set();
  for (const device of config.devices) {
    if (
      !device ||
      typeof device !== 'object' ||
      !['ac', 'dc', 'env'].includes(device.devicesType) ||
      typeof device.name !== 'string' ||
      !device.name.trim() ||
      types.has(device.devicesType)
    ) {
      throw new Error(
        'device.config.json deve configurar exatamente um device ac, um dc e um env.',
      );
    }
    types.add(device.devicesType);
  }
  if (types.size !== 3) {
    throw new Error(
      'device.config.json deve configurar exatamente um device ac, um dc e um env.',
    );
  }
  return config.devices;
}

export function resolveEnabledDevices(devices, environment = process.env) {
  return devices.flatMap((device) => {
    const prefix = `DEVICE_${device.devicesType.toUpperCase()}`;
    const enabled = booleanSetting(
      environment[`${prefix}_ENABLED`],
      device.devicesType === 'ac',
      `${prefix}_ENABLED`,
    );
    if (!enabled) return [];

    const writeKey =
      environment[`${prefix}_WRITE_API_KEY`] ??
      (device.devicesType === 'ac'
        ? environment.DEVICE_WRITE_API_KEY
        : undefined);
    if (!writeKey) {
      throw new Error(
        `Defina ${prefix}_WRITE_API_KEY para ativar o device ${device.name}.`,
      );
    }
    return [{ device, writeKey }];
  });
}

export function generateTelemetry(
  type,
  random = Math.random,
  now = new Date(),
) {
  const generator = generators[type];
  if (!generator) throw new Error(`Tipo de device sem simulador: ${type}.`);
  return generator(random, now);
}

export function generateAcTelemetry(random = Math.random, now = new Date()) {
  return {
    time: now.toISOString(),
    v1: decimalBetween(random, 215, 235, 2),
    a1: decimalBetween(random, 0, 20, 2),
    fp1: decimalBetween(random, 0.85, 1, 3),
    rssi: integerBetween(random, -90, -40),
  };
}

export function generateDcTelemetry(random = Math.random, now = new Date()) {
  return {
    time: now.toISOString(),
    vdc1: decimalBetween(random, 11.5, 14.5, 2),
    cc1: decimalBetween(random, 0, 20, 2),
    vdc2: decimalBetween(random, 11.5, 14.5, 2),
    cc2: decimalBetween(random, 0, 20, 2),
    vdc3: decimalBetween(random, 11.5, 14.5, 2),
    cc3: decimalBetween(random, 0, 20, 2),
    rssi: integerBetween(random, -90, -40),
  };
}

export function generateEnvTelemetry(random = Math.random, now = new Date()) {
  return {
    time: now.toISOString(),
    temp: decimalBetween(random, 15, 40, 2),
    humidity: decimalBetween(random, 20, 100, 2),
    solar: decimalBetween(random, 0, 1_200, 2),
    light: decimalBetween(random, 0, 100_000, 2),
    wind: decimalBetween(random, 0, 30, 2),
    h2: decimalBetween(random, 0, 100, 2),
    rssi: integerBetween(random, -90, -40),
  };
}

export async function sendTelemetry({
  apiUrl,
  writeKey,
  telemetry,
  fetchImplementation = fetch,
}) {
  const response = await fetchImplementation(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': writeKey,
    },
    body: JSON.stringify(telemetry),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `A API respondeu ${response.status}${responseBody ? `: ${responseBody}` : '.'}`,
    );
  }
  return response.json();
}

export async function runSimulator({
  apiUrl,
  writeKey,
  device,
  signal,
  fetchImplementation = fetch,
  onSuccess = console.log,
  onError = console.error,
}) {
  while (!signal.aborted) {
    const telemetry = generateTelemetry(device.devicesType);
    try {
      const created = await sendTelemetry({
        apiUrl,
        writeKey,
        telemetry,
        fetchImplementation,
      });
      onSuccess(
        `[${telemetry.time}] ${device.name}: telemetria ${String(created.id)} enviada.`,
      );
    } catch (error) {
      onError(
        `[${telemetry.time}] ${device.name}: ${error instanceof Error ? error.message : 'falha desconhecida no envio.'}`,
      );
    }
    await waitForNextReading(signal);
  }
}

async function main() {
  const apiUrl = new URL(
    process.env.API_URL ?? 'http://localhost:3000/api/telemetry',
  ).toString();
  const devices = await loadDeviceConfig();
  const enabledDevices = resolveEnabledDevices(devices);
  if (!enabledDevices.length) {
    throw new Error('Ative ao menos um device no arquivo .env.');
  }

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  console.log(
    `Simulando ${enabledDevices.length} device(s) em ${apiUrl}, com envios a cada 15 segundos.`,
  );
  for (const { device } of enabledDevices) {
    console.log(
      `- ${device.name} (${device.devicesType.toUpperCase()}, ${device.serialNumber}): ligado`,
    );
  }

  await Promise.all(
    enabledDevices.map(({ device, writeKey }) =>
      runSimulator({
        apiUrl,
        writeKey,
        device,
        signal: controller.signal,
      }),
    ),
  );
  console.log('Simulador encerrado.');
}

function booleanSetting(value, defaultValue, name) {
  if (value === undefined || value === '') return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} deve ser true ou false.`);
}

function numberBetween(random, minimum, maximum) {
  return minimum + random() * (maximum - minimum);
}

function decimalBetween(random, minimum, maximum, decimals) {
  return numberBetween(random, minimum, maximum).toFixed(decimals);
}

function integerBetween(random, minimum, maximum) {
  return String(Math.round(numberBetween(random, minimum, maximum)));
}

function waitForNextReading(signal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timeout = setTimeout(finish, INTERVAL_MS);
    const abort = () => {
      clearTimeout(timeout);
      finish();
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Falha ao iniciar o simulador.',
    );
    process.exitCode = 1;
  });
}

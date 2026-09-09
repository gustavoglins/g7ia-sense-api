import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.js';
import { deviceApiKeys, devices } from '../devices/devices.schema.js';
import { inputObject } from '../common/input.js';
import { telemetryAc, telemetryDc, telemetryEnv } from './telemetry.schema.js';

const fields = {
  ac: ['v1', 'a1', 'fp1', 'rssi'],
  env: ['temp', 'humidity', 'solar', 'light', 'wind', 'h2', 'rssi'],
  dc: ['vdc1', 'cc1', 'vdc2', 'cc2', 'vdc3', 'cc3', 'rssi'],
} as const;
export type TelemetryDevice = typeof devices.$inferSelect;

@Injectable()
export class TelemetryService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase,
  ) {}

  async authenticate(key: unknown): Promise<TelemetryDevice> {
    if (typeof key !== 'string' || !key || key.length > 128)
      throw new UnauthorizedException('Chave WRITE inválida.');
    const [record] = await this.db
      .select({ device: devices })
      .from(deviceApiKeys)
      .innerJoin(devices, eq(deviceApiKeys.deviceId, devices.id))
      .where(
        and(eq(deviceApiKeys.apiKey, key), eq(deviceApiKeys.type, 'write')),
      );
    if (!record) throw new UnauthorizedException('Chave WRITE inválida.');
    if (record.device.status !== 'active' || record.device.deletedAt)
      throw new ForbiddenException('Device indisponível.');
    return record.device;
  }

  async create(device: TelemetryDevice, body: unknown) {
    const type = device.devicesType;
    if (type !== 'ac' && type !== 'env' && type !== 'dc')
      throw new BadRequestException('Tipo de device sem suporte a telemetria.');
    const input = inputObject(body);
    const allowed: readonly string[] = fields[type];
    if (
      Object.keys(input).some((key) => key !== 'time' && !allowed.includes(key))
    )
      throw new BadRequestException(
        'Campos não permitidos para este tipo de device.',
      );
    const time = parseTelemetryTime(input.time);
    const measurements: Record<string, string | null> = {};
    for (const field of allowed) {
      const value = input[field];
      if (value !== undefined && value !== null && typeof value !== 'string')
        throw new BadRequestException(field + ' deve ser string.');
      measurements[field] =
        value === undefined ? null : (value as string | null);
    }
    const values = { ...measurements, deviceId: device.id, time };
    const table =
      type === 'ac' ? telemetryAc : type === 'env' ? telemetryEnv : telemetryDc;
    const [created] = await this.db.insert(table).values(values).returning();
    return created;
  }
}

export function parseTelemetryTime(value: unknown): Date {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    throw new BadRequestException('time deve ser ISO 8601 com fuso horário.');
  const [year, month, day, hour, minute, second] = value
    .slice(0, 19)
    .split(/[-T:]/)
    .map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = value.endsWith('Z')
    ? [0, 0]
    : value.slice(-5).split(':').map(Number);
  const date = new Date(value);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offset[0] > 23 ||
    offset[1] > 59 ||
    !Number.isFinite(date.getTime())
  )
    throw new BadRequestException('time inválido.');
  return date;
}

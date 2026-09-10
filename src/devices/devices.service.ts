import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, getTableColumns, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.js';
import { assertManage, assertRead, loadActor } from '../auth/roles.js';
import { inputObject, requiredText } from '../common/input.js';
import { installations } from '../installations/installations.schema.js';
import { sectors } from '../sectors/sectors.schema.js';
import { deviceApiKeys, devices } from './devices.schema.js';
import { CreateDeviceDto, deviceFields } from './dto/create-device.dto.js';
import { generateDeviceApiKey } from './device-api-keys.js';
import { withLatestTelemetry } from '../telemetry/latest-telemetry.js';
import {
  listQuery,
  optionalUuid,
  positiveInteger,
} from '../common/list-query.js';

@Injectable()
export class DevicesService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase,
  ) {}

  async create(actorId: string, body: unknown) {
    const actor = await loadActor(this.db, actorId);
    assertManage(actor, actor.companyId);
    const input = inputObject(body);
    const sectorId = requiredText(input, 'sectorId');
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sectorId,
      )
    )
      throw new BadRequestException('sectorId inválido.');
    if (
      Object.keys(input).some(
        (key) => !['sectorId', ...deviceFields].includes(key),
      )
    )
      throw new BadRequestException('Campos não permitidos.');
    const data = CreateDeviceDto.parse(input);
    const readKey = generateDeviceApiKey('read');
    const writeKey = generateDeviceApiKey('write');
    return this.db.transaction(async (tx) => {
      const [parent] = await tx
        .select({ companyId: installations.companyId })
        .from(sectors)
        .innerJoin(installations, eq(sectors.installationId, installations.id))
        .where(eq(sectors.id, sectorId))
        .for('key share');
      if (!parent) throw new NotFoundException('Setor não encontrado.');
      assertManage(actor, parent.companyId);
      const [created] = await tx
        .insert(devices)
        .values({ ...data, sectorId })
        .returning();
      await tx.insert(deviceApiKeys).values([
        { deviceId: created.id, type: 'read', apiKey: readKey },
        { deviceId: created.id, type: 'write', apiKey: writeKey },
      ]);
      return {
        ...created,
        apiKeys: { read: readKey, write: writeKey },
      };
    });
  }

  async findAll(actorId: string, input: unknown = {}) {
    const actor = await loadActor(this.db, actorId);
    const query = listQuery(input, [
      'installationId',
      'sectorId',
      'companyId',
      'page',
      'limit',
    ]);
    const installationId = optionalUuid(query, 'installationId');
    const sectorId = optionalUuid(query, 'sectorId');
    const companyId = optionalUuid(query, 'companyId');
    if (companyId) assertRead(actor, companyId);
    const page = positiveInteger(query, 'page', 1);
    const limit = positiveInteger(query, 'limit', 20, 100);
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset))
      throw new BadRequestException('page fora do intervalo permitido.');
    const where = and(
      actor.role === 'super_admin'
        ? undefined
        : eq(installations.companyId, actor.companyId),
      companyId ? eq(installations.companyId, companyId) : undefined,
      installationId ? eq(installations.id, installationId) : undefined,
      sectorId ? eq(sectors.id, sectorId) : undefined,
    );
    const result = await this.db
      .select({
        ...getTableColumns(devices),
        sector: { id: sectors.id, name: sectors.name },
        installation: { id: installations.id, name: installations.name },
      })
      .from(devices)
      .innerJoin(sectors, eq(devices.sectorId, sectors.id))
      .innerJoin(installations, eq(sectors.installationId, installations.id))
      .where(where)
      .orderBy(asc(devices.name), asc(devices.id))
      .limit(limit)
      .offset(offset);
    const [totals] = await this.db
      .select({ total: count() })
      .from(devices)
      .innerJoin(sectors, eq(devices.sectorId, sectors.id))
      .innerJoin(installations, eq(sectors.installationId, installations.id))
      .where(where);
    return {
      data: await withLatestTelemetry(this.db, await this.withApiKeys(result)),
      pagination: {
        page,
        limit,
        total: totals.total,
        totalPages: Math.ceil(totals.total / limit),
      },
    };
  }

  private async findWithCompany(id: string) {
    const [record] = await this.db
      .select({
        device: devices,
        companyId: installations.companyId,
        sector: { id: sectors.id, name: sectors.name },
        installation: { id: installations.id, name: installations.name },
      })
      .from(devices)
      .innerJoin(sectors, eq(devices.sectorId, sectors.id))
      .innerJoin(installations, eq(sectors.installationId, installations.id))
      .where(eq(devices.id, id));
    if (!record) throw new NotFoundException('Device não encontrado.');
    return record;
  }

  async findOne(actorId: string, id: string) {
    const actor = await loadActor(this.db, actorId);
    const record = await this.findWithCompany(id);
    assertRead(actor, record.companyId);
    return (
      await withLatestTelemetry(
        this.db,
        await this.withApiKeys([
          {
            ...record.device,
            sector: record.sector,
            installation: record.installation,
          },
        ]),
      )
    )[0];
  }

  async update(actorId: string, id: string, body: unknown) {
    const actor = await loadActor(this.db, actorId);
    const record = await this.findWithCompany(id);
    assertManage(actor, record.companyId);
    const input = inputObject(body);
    if (
      !Object.keys(input).length ||
      Object.keys(input).some((key) => !deviceFields.includes(key))
    )
      throw new BadRequestException(
        'Informe apenas os campos editáveis do device. O setor não pode ser alterado.',
      );
    const data = CreateDeviceDto.parse({ ...record.device, ...input });
    const [updated] = await this.db
      .update(devices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(devices.id, id))
      .returning();
    if (!updated) throw new NotFoundException('Device não encontrado.');
    return (await this.withApiKeys([updated]))[0];
  }

  async remove(actorId: string, id: string) {
    const actor = await loadActor(this.db, actorId);
    const record = await this.findWithCompany(id);
    assertManage(actor, record.companyId);
    const [removed] = await this.db
      .delete(devices)
      .where(eq(devices.id, id))
      .returning({ id: devices.id });
    if (!removed) throw new NotFoundException('Device não encontrado.');
    return removed;
  }

  private async withApiKeys<T extends { id: string }>(devicesToAttach: T[]) {
    if (!devicesToAttach.length)
      return [] as (T & { apiKeys: { read: string; write: string } })[];
    const keys = await this.db
      .select({
        deviceId: deviceApiKeys.deviceId,
        type: deviceApiKeys.type,
        apiKey: deviceApiKeys.apiKey,
      })
      .from(deviceApiKeys)
      .where(
        inArray(
          deviceApiKeys.deviceId,
          devicesToAttach.map((device) => device.id),
        ),
      );
    const byDevice = new Map<
      string,
      Partial<Record<'read' | 'write', string>>
    >();
    for (const key of keys) {
      const values = byDevice.get(key.deviceId) ?? {};
      values[key.type] = key.apiKey;
      byDevice.set(key.deviceId, values);
    }
    return devicesToAttach.map((device) => {
      const apiKeys = byDevice.get(device.id);
      if (!apiKeys?.read || !apiKeys.write) {
        throw new Error(`Device ${device.id} is missing an API key pair.`);
      }
      return {
        ...device,
        apiKeys: { read: apiKeys.read, write: apiKeys.write },
      };
    });
  }
}

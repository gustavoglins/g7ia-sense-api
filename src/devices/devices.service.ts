import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, getTableColumns } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.js';
import { assertManage, assertRead, loadActor } from '../auth/roles.js';
import { inputObject, requiredText } from '../common/input.js';
import { installations } from '../installations/installations.schema.js';
import { sectors } from '../sectors/sectors.schema.js';
import { devices } from './devices.schema.js';
import { CreateDeviceDto, deviceFields } from './dto/create-device.dto.js';

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
      return created;
    });
  }

  async findAll(actorId: string) {
    const actor = await loadActor(this.db, actorId);
    return this.db
      .select(getTableColumns(devices))
      .from(devices)
      .innerJoin(sectors, eq(devices.sectorId, sectors.id))
      .innerJoin(installations, eq(sectors.installationId, installations.id))
      .where(
        actor.role === 'super_admin'
          ? undefined
          : eq(installations.companyId, actor.companyId),
      );
  }

  private async findWithCompany(id: string) {
    const [record] = await this.db
      .select({ device: devices, companyId: installations.companyId })
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
    return record.device;
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
    return updated;
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
}

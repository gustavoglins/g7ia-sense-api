import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, getTableColumns } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.js';
import { assertManage, assertRead, loadActor } from '../auth/roles.js';
import { inputObject, requiredText } from '../common/input.js';
import { installations } from '../installations/installations.schema.js';
import { sectors } from './sectors.schema.js';
import { CreateSectorDto } from './dto/create-sector.dto.js';
import { listQuery, optionalUuid } from '../common/list-query.js';

@Injectable()
export class SectorsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase,
  ) {}

  async create(actorId: string, body: unknown) {
    const actor = await loadActor(this.db, actorId);
    assertManage(actor, actor.companyId);
    const input = inputObject(body);
    const installationId = requiredText(input, 'installationId');
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        installationId,
      )
    )
      throw new BadRequestException('installationId inválido.');
    if (
      Object.keys(input).some(
        (key) =>
          !['installationId', 'name', 'description', 'status'].includes(key),
      )
    )
      throw new BadRequestException('Campos não permitidos.');
    const data = CreateSectorDto.parse(input);
    return this.db.transaction(async (tx) => {
      const [installation] = await tx
        .select()
        .from(installations)
        .where(eq(installations.id, installationId))
        .for('key share');
      if (!installation)
        throw new NotFoundException('Instalação não encontrada.');
      assertManage(actor, installation.companyId);
      try {
        const [created] = await tx
          .insert(sectors)
          .values({ ...data, installationId })
          .returning();
        return created;
      } catch (error) {
        this.rethrow(error);
      }
    });
  }

  async findAll(actorId: string, input: unknown = {}) {
    const actor = await loadActor(this.db, actorId);
    const query = listQuery(input, ['installationId']);
    const installationId = optionalUuid(query, 'installationId');
    return this.db
      .select(getTableColumns(sectors))
      .from(sectors)
      .innerJoin(installations, eq(sectors.installationId, installations.id))
      .where(
        and(
          actor.role === 'super_admin'
            ? undefined
            : eq(installations.companyId, actor.companyId),
          installationId ? eq(installations.id, installationId) : undefined,
        ),
      )
      .orderBy(asc(sectors.name), asc(sectors.id));
  }

  private async findWithCompany(id: string) {
    const [record] = await this.db
      .select({ sector: sectors, companyId: installations.companyId })
      .from(sectors)
      .innerJoin(installations, eq(sectors.installationId, installations.id))
      .where(eq(sectors.id, id));
    if (!record) throw new NotFoundException('Setor não encontrado.');
    return record;
  }

  async findOne(actorId: string, id: string) {
    const actor = await loadActor(this.db, actorId);
    const record = await this.findWithCompany(id);
    assertRead(actor, record.companyId);
    return record.sector;
  }

  async update(actorId: string, id: string, body: unknown) {
    const actor = await loadActor(this.db, actorId);
    const record = await this.findWithCompany(id);
    assertManage(actor, record.companyId);
    const input = inputObject(body);
    if (
      !Object.keys(input).length ||
      Object.keys(input).some(
        (key) => !['name', 'description', 'status'].includes(key),
      )
    )
      throw new BadRequestException(
        'Informe apenas name, description ou status. A instalação não pode ser alterada.',
      );
    const data = CreateSectorDto.parse({ ...record.sector, ...input });
    try {
      const [updated] = await this.db
        .update(sectors)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(sectors.id, id))
        .returning();
      if (!updated) throw new NotFoundException('Setor não encontrado.');
      return updated;
    } catch (error) {
      this.rethrow(error);
    }
  }

  async remove(actorId: string, id: string) {
    const actor = await loadActor(this.db, actorId);
    const record = await this.findWithCompany(id);
    assertManage(actor, record.companyId);
    const [removed] = await this.db
      .delete(sectors)
      .where(eq(sectors.id, id))
      .returning({ id: sectors.id });
    if (!removed) throw new NotFoundException('Setor não encontrado.');
    return removed;
  }

  private rethrow(error: unknown): never {
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === '23505' || cause.cause?.code === '23505')
      throw new ConflictException('Nome de setor já cadastrado.');
    throw error;
  }
}

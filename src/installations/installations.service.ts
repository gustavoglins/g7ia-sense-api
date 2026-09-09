import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.js';
import { assertManage, assertRead, loadActor } from '../auth/roles.js';
import { inputObject, requiredText } from '../common/input.js';
import { companies } from '../companies/companies.schema.js';
import { installations } from './installations.schema.js';
import {
  CreateInstallationDto,
  installationFields,
} from './dto/create-installation.dto.js';

@Injectable()
export class InstallationsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase,
  ) {}

  async create(actorId: string, body: unknown) {
    const actor = await loadActor(this.db, actorId);
    const input = inputObject(body);
    const companyId =
      input.companyId === undefined
        ? actor.companyId
        : requiredText(input, 'companyId');
    assertManage(actor, companyId);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        companyId,
      )
    )
      throw new BadRequestException('companyId inválido.');
    if (
      Object.keys(input).some(
        (key) => ![...installationFields, 'companyId'].includes(key),
      )
    )
      throw new BadRequestException('Campos não permitidos.');
    const data = CreateInstallationDto.parse(input);
    return this.db.transaction(async (tx) => {
      const [company] = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId))
        .for('key share');
      if (!company) throw new NotFoundException('Empresa não encontrada.');
      try {
        const [created] = await tx
          .insert(installations)
          .values({ ...data, companyId })
          .returning();
        return created;
      } catch (error) {
        this.rethrow(error);
      }
    });
  }

  async findAll(actorId: string) {
    const actor = await loadActor(this.db, actorId);
    return this.db
      .select()
      .from(installations)
      .where(
        actor.role === 'super_admin'
          ? undefined
          : eq(installations.companyId, actor.companyId),
      );
  }

  async findOne(actorId: string, id: string) {
    const actor = await loadActor(this.db, actorId);
    const [installation] = await this.db
      .select()
      .from(installations)
      .where(eq(installations.id, id));
    if (!installation)
      throw new NotFoundException('Instalação não encontrada.');
    assertRead(actor, installation.companyId);
    return installation;
  }

  async update(actorId: string, id: string, body: unknown) {
    const actor = await loadActor(this.db, actorId);
    const existing = await this.findOne(actorId, id);
    assertManage(actor, existing.companyId);
    const input = inputObject(body);
    if (
      !Object.keys(input).length ||
      Object.keys(input).some((key) => !installationFields.includes(key))
    )
      throw new BadRequestException(
        'Informe apenas os campos editáveis da instalação. A empresa não pode ser alterada.',
      );
    const data = CreateInstallationDto.parse({ ...existing, ...input });
    try {
      const [updated] = await this.db
        .update(installations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(installations.id, id))
        .returning();
      if (!updated) throw new NotFoundException('Instalação não encontrada.');
      return updated;
    } catch (error) {
      this.rethrow(error);
    }
  }

  async remove(actorId: string, id: string) {
    const actor = await loadActor(this.db, actorId);
    const existing = await this.findOne(actorId, id);
    assertManage(actor, existing.companyId);
    const [removed] = await this.db
      .delete(installations)
      .where(eq(installations.id, id))
      .returning({ id: installations.id });
    if (!removed) throw new NotFoundException('Instalação não encontrada.');
    return removed;
  }

  private rethrow(error: unknown): never {
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === '23505' || cause.cause?.code === '23505')
      throw new ConflictException('Nome de instalação já cadastrado.');
    throw error;
  }
}

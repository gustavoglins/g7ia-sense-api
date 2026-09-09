import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.js';
import { user, account } from '../auth/schema.js';
import { companyUsernameSuffix } from '../auth/username.js';
import { companies } from './companies.schema.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { inputObject } from '../common/input.js';
import {
  assertManage,
  assertRead,
  assertSuperAdmin,
  loadActor,
} from '../auth/roles.js';

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase,
  ) {}

  async create(actorId: string, createCompanyDto: CreateCompanyDto) {
    assertSuperAdmin(await loadActor(this.db, actorId));
    const { adminPassword, ...companyData } =
      CreateCompanyDto.parse(createCompanyDto);
    const usernameSuffix = companyUsernameSuffix(companyData.legalName);
    const username = `admin@${usernameSuffix}`;
    const password = await hashPassword(adminPassword);
    try {
      return await this.db.transaction(async (tx) => {
        const [company] = await tx
          .insert(companies)
          .values({ ...companyData, usernameSuffix })
          .returning();
        const userId = randomUUID();
        const [admin] = await tx
          .insert(user)
          .values({
            id: userId,
            name: `Administrador ${company.name}`,
            username,
            role: 'admin',
            // Better Auth requires an internal email, even for username-only login.
            email: `${userId}@users.invalid`,
            companyId: company.id,
          })
          .returning({
            id: user.id,
            name: user.name,
            username: user.username,
            companyId: user.companyId,
            role: user.role,
          });
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: userId,
          userId,
          providerId: 'credential',
          password,
        });
        return { company, admin };
      });
    } catch (error) {
      const cause = error as { cause?: { code?: string }; code?: string };
      if (cause.code === '23505' || cause.cause?.code === '23505') {
        throw new ConflictException(
          'Empresa ou identificador de login já cadastrado.',
        );
      }
      throw error;
    }
  }

  async findAll(actorId: string) {
    const actor = await loadActor(this.db, actorId);
    return this.db
      .select()
      .from(companies)
      .where(
        actor.role === 'super_admin'
          ? undefined
          : eq(companies.id, actor.companyId),
      );
  }

  async findOne(actorId: string, id: string) {
    assertRead(await loadActor(this.db, actorId), id);
    const [company] = await this.db
      .select()
      .from(companies)
      .where(eq(companies.id, id));
    if (!company) throw new NotFoundException('Empresa não encontrada.');
    return company;
  }

  async update(actorId: string, id: string, body: unknown) {
    assertManage(await loadActor(this.db, actorId), id);
    const existing = await this.findOne(actorId, id);
    const input = inputObject(body);
    const editable = [
      'name',
      'legalName',
      'taxId',
      'email',
      'phone',
      'website',
      'zipcode',
      'country',
      'state',
      'city',
      'district',
      'street',
      'number',
      'complement',
      'status',
      'notes',
    ];
    if (
      !Object.keys(input).length ||
      Object.keys(input).some((key) => !editable.includes(key))
    ) {
      throw new BadRequestException(
        'Informe apenas os campos editáveis da empresa.',
      );
    }
    // Reuse field validation; changing legalName does not change the login suffix.
    const { adminPassword: _password, ...changes } = CreateCompanyDto.parse({
      ...existing,
      ...input,
      adminPassword: 'validation-only',
    });
    try {
      const [updated] = await this.db
        .update(companies)
        .set(changes)
        .where(eq(companies.id, id))
        .returning();
      if (!updated) throw new NotFoundException('Empresa não encontrada.');
      return updated;
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === '23505')
        throw new ConflictException('Dados da empresa já cadastrados.');
      throw error;
    }
  }

  async remove(actorId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const actor = await loadActor(tx, actorId);
      assertManage(actor, id);
      const [company] = await tx
        .select()
        .from(companies)
        .where(eq(companies.id, id))
        .for('update');
      if (!company) throw new NotFoundException('Empresa não encontrada.');
      const [globalUser] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.companyId, id), eq(user.role, 'super_admin')))
        .limit(1);
      if (globalUser) assertSuperAdmin(actor);
      // Sessions and credentials cascade; deferred company checks run at commit.
      await tx.delete(user).where(eq(user.companyId, id));
      await tx.delete(companies).where(eq(companies.id, id));
      return { id };
    });
  }
}

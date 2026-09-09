import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.js';
import { account, session, user } from '../auth/schema.js';
import { companies } from '../companies/companies.schema.js';
import { isValidUsername, normalizeUsername } from '../auth/username.js';
import {
  credentialPassword,
  inputObject,
  requiredText,
} from '../common/input.js';
import {
  assertAssignRole,
  assertManage,
  assertManageUser,
  assertRead,
  loadActor,
  parseRole,
} from '../auth/roles.js';

const publicUser = {
  id: user.id,
  name: user.name,
  username: user.username,
  companyId: user.companyId,
  role: user.role,
  createdAt: user.createdAt,
};

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase,
  ) {}

  async create(actorId: string, body: unknown) {
    const actor = await loadActor(this.db, actorId);
    assertManage(actor, actor.companyId);
    const input = inputObject(body);
    const role = input.role === undefined ? 'user' : parseRole(input.role);
    assertAssignRole(actor, role);
    const name = requiredText(input, 'name');
    const username = normalizeUsername(requiredText(input, 'username'));
    if (!isValidUsername(username) || username.startsWith('admin@')) {
      throw new BadRequestException(
        'Use nome+sobrenome@empresa. O usuário admin é criado exclusivamente pelo sistema.',
      );
    }
    const password = await hashPassword(credentialPassword(input));
    try {
      return await this.db.transaction(async (tx) => {
        const companyId =
          actor.role === 'super_admin' && input.companyId !== undefined
            ? requiredText(input, 'companyId')
            : actor.companyId;
        if (
          actor.role !== 'super_admin' &&
          input.companyId !== undefined &&
          input.companyId !== actor.companyId
        ) {
          throw new ForbiddenException('Acesso restrito à sua empresa.');
        }
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            companyId,
          )
        )
          throw new BadRequestException('companyId inválido.');
        const [company] = await tx
          .select()
          .from(companies)
          .where(eq(companies.id, companyId));
        if (!company) throw new NotFoundException('Empresa não encontrada.');
        if (username.split('@')[1] !== company.usernameSuffix) {
          throw new BadRequestException(
            'O username deve usar o identificador da sua empresa.',
          );
        }
        const id = randomUUID();
        const [created] = await tx
          .insert(user)
          .values({
            id,
            name,
            username,
            companyId,
            role,
            email: `${id}@users.invalid`,
          })
          .returning(publicUser);
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: id,
          userId: id,
          providerId: 'credential',
          password,
        });
        return created;
      });
    } catch (error) {
      const cause = error as { code?: string; cause?: { code?: string } };
      if (cause.code === '23505' || cause.cause?.code === '23505') {
        throw new ConflictException('Username já cadastrado.');
      }
      throw error;
    }
  }

  async findAll(actorId: string) {
    const actor = await loadActor(this.db, actorId);
    return this.db
      .select(publicUser)
      .from(user)
      .where(
        actor.role === 'super_admin'
          ? undefined
          : eq(user.companyId, actor.companyId),
      );
  }

  async findOne(actorId: string, id: string) {
    const actor = await loadActor(this.db, actorId);
    const [target] = await this.db
      .select(publicUser)
      .from(user)
      .where(eq(user.id, id));
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    assertRead(actor, target.companyId);
    return target;
  }

  async update(actorId: string, id: string, body: unknown) {
    const input = inputObject(body);
    if (
      !Object.keys(input).length ||
      Object.keys(input).some(
        (key) => !['name', 'role', 'password'].includes(key),
      )
    ) {
      throw new BadRequestException('Informe apenas name, role ou password.');
    }
    return this.db.transaction(async (tx) => {
      const actor = await loadActor(tx, actorId);
      const [target] = await tx
        .select(publicUser)
        .from(user)
        .where(eq(user.id, id))
        .for('update');
      if (!target) throw new NotFoundException('Usuário não encontrado.');
      assertManageUser(actor, target);
      const role =
        input.role === undefined ? target.role : parseRole(input.role);
      assertAssignRole(actor, role);
      if (target.username.startsWith('admin@') && role === 'user') {
        throw new ConflictException(
          'O administrador automático deve manter role admin ou super_admin.',
        );
      }
      const [updated] = await tx
        .update(user)
        .set({
          name:
            input.name === undefined
              ? target.name
              : requiredText(input, 'name'),
          role,
        })
        .where(eq(user.id, id))
        .returning(publicUser);
      if (input.password !== undefined) {
        const password = await hashPassword(credentialPassword(input));
        // Application-provisioned users always have one credential account.
        await tx
          .update(account)
          .set({ password })
          .where(eq(account.userId, id));
      }
      if (role !== target.role || input.password !== undefined) {
        await tx.delete(session).where(eq(session.userId, id));
      }
      return updated;
    });
  }

  async remove(actorId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const actor = await loadActor(tx, actorId);
      const [target] = await tx
        .select(publicUser)
        .from(user)
        .where(eq(user.id, id))
        .for('update');
      if (!target) throw new NotFoundException('Usuário não encontrado.');
      assertManageUser(actor, target);
      if (target.username.startsWith('admin@'))
        throw new ConflictException(
          'O administrador automático só pode ser excluído junto com a empresa.',
        );
      await tx.delete(user).where(eq(user.id, id));
      return { id };
    });
  }
}

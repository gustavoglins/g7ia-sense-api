import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { user } from './schema.js';

export const roles = ['super_admin', 'admin', 'user'] as const;
export type Role = (typeof roles)[number];
export type Actor = { id: string; companyId: string; role: Role };

export async function loadActor(
  db: Pick<NodePgDatabase, 'select'>,
  id: string,
): Promise<Actor> {
  const [actor] = await db
    .select({ id: user.id, companyId: user.companyId, role: user.role })
    .from(user)
    .where(eq(user.id, id));
  if (!actor) throw new UnauthorizedException();
  return actor;
}

export function parseRole(value: unknown): Role {
  if (!roles.includes(value as Role))
    throw new BadRequestException('Role deve ser super_admin, admin ou user.');
  return value as Role;
}

export function assertRead(actor: Actor, companyId: string) {
  if (actor.role !== 'super_admin' && actor.companyId !== companyId) {
    throw new ForbiddenException('Acesso restrito à sua empresa.');
  }
}

export function assertManage(actor: Actor, companyId: string) {
  assertRead(actor, companyId);
  if (actor.role === 'user')
    throw new ForbiddenException(
      'Somente o administrador pode alterar dados da empresa.',
    );
}

export function assertSuperAdmin(actor: Actor) {
  if (actor.role !== 'super_admin')
    throw new ForbiddenException('Operação exclusiva de super_admin.');
}

export function assertAssignRole(actor: Actor, role: Role) {
  if (role === 'super_admin') assertSuperAdmin(actor);
}

export function assertManageUser(actor: Actor, target: Actor) {
  assertManage(actor, target.companyId);
  if (target.role === 'super_admin') assertSuperAdmin(actor);
}

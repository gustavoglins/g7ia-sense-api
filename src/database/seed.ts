import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { account, user } from '../auth/schema.js';
import { companyUsernameSuffix } from '../auth/username.js';
import { companies } from '../companies/companies.schema.js';
import { CreateCompanyDto } from '../companies/dto/create-company.dto.js';
import { inputObject } from '../common/input.js';
import { installations } from '../installations/installations.schema.js';
import { CreateInstallationDto } from '../installations/dto/create-installation.dto.js';
import { sectors } from '../sectors/sectors.schema.js';
import { CreateSectorDto } from '../sectors/dto/create-sector.dto.js';
import { devices } from '../devices/devices.schema.js';
import { CreateDeviceDto } from '../devices/dto/create-device.dto.js';

type SeedRecord = { id: string; name: string; created: boolean };

// Local provisioning only: never expose this function through a public route.
export async function seedInitialCompany(db: NodePgDatabase, input: unknown) {
  const { adminPassword, ...companyData } = CreateCompanyDto.parse(input);
  const usernameSuffix = companyUsernameSuffix(companyData.legalName);
  const username = `admin@${usernameSuffix}`;
  const installationInput = inputObject(input).installation;
  const installationData = CreateInstallationDto.parse({
    name: `Matriz - ${usernameSuffix}`,
    zipcode: companyData.zipcode,
    country: companyData.country,
    state: companyData.state,
    city: companyData.city,
    district: companyData.district,
    street: companyData.street,
    number: companyData.number,
    complement: companyData.complement,
    status: companyData.status,
    ...(installationInput === undefined ? {} : inputObject(installationInput)),
  });
  const password = await hashPassword(adminPassword);
  const sectorInput =
    installationInput === undefined
      ? undefined
      : inputObject(installationInput).sectors;
  if (
    sectorInput !== undefined &&
    (!Array.isArray(sectorInput) || !sectorInput.length)
  ) {
    throw new BadRequestException(
      'installation.sectors deve ser uma lista não vazia.',
    );
  }
  const sectorData = (
    sectorInput === undefined
      ? [{ name: `Geral - ${usernameSuffix}`, status: installationData.status }]
      : (sectorInput as unknown[])
  ).map((value) => {
    const sector = CreateSectorDto.parse(value);
    const deviceInput = inputObject(value).devices;
    if (
      deviceInput !== undefined &&
      (!Array.isArray(deviceInput) || !deviceInput.length)
    ) {
      throw new BadRequestException(
        'devices deve ser uma lista não vazia em cada setor.',
      );
    }
    const deviceData = (
      deviceInput === undefined
        ? [{ name: 'Device inicial', devicesType: 'ac', status: sector.status }]
        : (deviceInput as unknown[])
    ).map((device) => CreateDeviceDto.parse(device));
    if (
      new Set(deviceData.map((device) => device.name)).size !==
      deviceData.length
    ) {
      throw new BadRequestException(
        'Os nomes dos devices do seed não podem se repetir no mesmo setor.',
      );
    }
    return { ...sector, devices: deviceData };
  });
  if (
    new Set(sectorData.map((sector) => sector.name)).size !== sectorData.length
  ) {
    throw new BadRequestException(
      'Os nomes dos setores do seed não podem se repetir.',
    );
  }
  try {
    return await db.transaction(async (tx) => {
      // Serializes simultaneous executions of the seed, including an empty database.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7142026)`);
      async function ensureDevices(
        sectorId: string,
        data: (typeof sectorData)[number]['devices'],
      ) {
        const result: SeedRecord[] = [];
        for (const device of data) {
          const existing = await tx
            .select({ id: devices.id, name: devices.name })
            .from(devices)
            .where(
              and(
                eq(devices.sectorId, sectorId),
                eq(devices.name, device.name),
              ),
            )
            .limit(2);
          if (existing.length > 1)
            throw new ConflictException(
              'Há mais de um device com o mesmo nome no setor. O seed não pode identificar o registro; nenhuma alteração foi salva.',
            );
          if (existing.length) result.push({ ...existing[0], created: false });
          else {
            const [created] = await tx
              .insert(devices)
              .values({ ...device, sectorId })
              .returning({ id: devices.id, name: devices.name });
            result.push({ ...created, created: true });
          }
        }
        return result;
      }
      async function ensureSectors(installationId: string) {
        const result: (SeedRecord & { devices: SeedRecord[] })[] = [];
        for (const { devices: deviceData, ...data } of sectorData) {
          const [existingSector] = await tx
            .select()
            .from(sectors)
            .where(eq(sectors.name, data.name));
          if (existingSector) {
            if (existingSector.installationId !== installationId) {
              throw new ConflictException(
                'Um setor do seed já pertence a outra instalação. Nenhum dado foi alterado.',
              );
            }
            result.push({
              id: existingSector.id,
              name: existingSector.name,
              created: false,
              devices: await ensureDevices(existingSector.id, deviceData),
            });
          } else {
            const [created] = await tx
              .insert(sectors)
              .values({ ...data, installationId })
              .returning({ id: sectors.id, name: sectors.name });
            result.push({
              ...created,
              created: true,
              devices: await ensureDevices(created.id, deviceData),
            });
          }
        }
        return result;
      }
      async function ensureInstallation(companyId: string) {
        const [existingInstallation] = await tx
          .select()
          .from(installations)
          .where(eq(installations.name, installationData.name));
        if (existingInstallation) {
          if (existingInstallation.companyId !== companyId) {
            throw new ConflictException(
              'O nome da instalação do seed já pertence a outra empresa. Nenhum dado foi alterado.',
            );
          }
          return {
            installationId: existingInstallation.id,
            installationCreated: false,
            sectors: await ensureSectors(existingInstallation.id),
          };
        }
        const [installation] = await tx
          .insert(installations)
          .values({ ...installationData, companyId })
          .returning({ id: installations.id });
        return {
          installationId: installation.id,
          installationCreated: true,
          sectors: await ensureSectors(installation.id),
        };
      }
      const [existing] = await tx
        .select()
        .from(companies)
        .where(eq(companies.taxId, companyData.taxId));
      if (existing) {
        const [admin] = await tx
          .select({ id: user.id, username: user.username, role: user.role })
          .from(user)
          .where(
            and(eq(user.companyId, existing.id), eq(user.username, username)),
          );
        const [credential] = admin
          ? await tx
              .select({ password: account.password })
              .from(account)
              .where(
                and(
                  eq(account.userId, admin.id),
                  eq(account.providerId, 'credential'),
                ),
              )
          : [];
        if (
          existing.usernameSuffix !== usernameSuffix ||
          admin?.role !== 'super_admin' ||
          !credential?.password
        ) {
          throw new ConflictException(
            'A empresa já existe, mas não corresponde ao seed completo. Nenhum dado foi alterado. Para promover uma conta existente, use roles:promote.',
          );
        }
        return {
          created: false,
          companyId: existing.id,
          username: admin.username,
          role: admin.role,
          ...(await ensureInstallation(existing.id)),
        };
      }
      const [company] = await tx
        .insert(companies)
        .values({ ...companyData, usernameSuffix })
        .returning({ id: companies.id });
      const id = randomUUID();
      await tx.insert(user).values({
        id,
        name: `Administrador ${companyData.name}`,
        username,
        role: 'super_admin',
        email: `${id}@users.invalid`,
        companyId: company.id,
      });
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: id,
        userId: id,
        providerId: 'credential',
        password,
      });
      return {
        created: true,
        companyId: company.id,
        username,
        role: 'super_admin' as const,
        ...(await ensureInstallation(company.id)),
      };
    });
  } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === '23505' || cause.cause?.code === '23505') {
      throw new ConflictException(
        'Os dados do seed conflitam com registros existentes. Nenhum dado foi alterado.',
      );
    }
    throw error;
  }
}

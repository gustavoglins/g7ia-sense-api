import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { verifyPassword } from 'better-auth/crypto';
import { CompaniesService } from './companies.service.js';
import { UsersService } from '../users/users.service.js';
import * as authSchema from '../auth/schema.js';
import * as companySchema from './companies.schema.js';
import { authOptions } from '../auth/auth-options.js';
import { seedInitialCompany } from '../database/seed.js';
import * as installationsSchema from '../installations/installations.schema.js';
import { InstallationsService } from '../installations/installations.service.js';
import * as sectorsSchema from '../sectors/sectors.schema.js';
import { SectorsService } from '../sectors/sectors.service.js';
import * as devicesSchema from '../devices/devices.schema.js';
import { DevicesService } from '../devices/devices.service.js';

// Explicitly opt in with an EMPTY disposable database; never reads DATABASE_URL.
describe.skipIf(!process.env.DATABASE_TEST_URL)(
  'company provisioning (PostgreSQL)',
  () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const db = drizzle(pool, {
      schema: {
        ...authSchema,
        ...companySchema,
        ...installationsSchema,
        ...sectorsSchema,
        ...devicesSchema,
      },
    });
    const installationService = new InstallationsService(db);
    const sectorService = new SectorsService(db);
    const deviceService = new DevicesService(db);
    const service = new CompaniesService(db);
    const users = new UsersService(db);
    const password = 'integration-password-123';
    let rootId: string;
    const createCompany = (data: ReturnType<typeof input>) =>
      service.create(rootId, data);

    function input(legalName = `Empresa ${randomUUID()}`) {
      return {
        name: 'Empresa de teste',
        legalName,
        taxId: randomUUID(),
        zipcode: '12345678',
        country: 'Brasil',
        state: 'SP',
        city: 'São Paulo',
        district: 'Centro',
        street: 'Rua A',
        number: '1',
        status: 'active' as const,
        adminPassword: password,
      };
    }

    beforeAll(async () => {
      const { rows } = await pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
      );
      if (rows.length)
        throw new Error(
          'DATABASE_TEST_URL must point to an empty disposable database.',
        );
      const journal = JSON.parse(
        await readFile('drizzle/meta/_journal.json', 'utf8'),
      ) as { entries: { tag: string }[] };
      for (const { tag } of journal.entries) {
        await pool.query(await readFile(`drizzle/${tag}.sql`, 'utf8'));
      }
      // Seed the first operator locally; there is no anonymous promotion route.
      await seedInitialCompany(db, input('Root Company'));
      const [root] = await db
        .select()
        .from(authSchema.user)
        .where(eq(authSchema.user.username, 'admin@rootcompany'));
      rootId = root.id;
    });

    afterAll(async () => {
      await pool.end();
    });

    it('creates company, admin and hashed credentials and supports username login', async () => {
      const result = await createCompany(input('São José Ltda'));
      expect(result.admin.role).toBe('admin');
      expect(result.admin.username).toBe('admin@saojoseltda');
      expect(result.admin.companyId).toBe(result.company.id);
      const [credential] = await db
        .select()
        .from(authSchema.account)
        .where(eq(authSchema.account.userId, result.admin.id));
      expect(credential.password).not.toBe(password);
      expect(
        await verifyPassword({ hash: credential.password!, password }),
      ).toBe(true);
      const auth = betterAuth({
        ...authOptions,
        secret: 'integration-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
        baseURL: 'http://localhost:3000',
        database: drizzleAdapter(db, { provider: 'pg' }),
      });
      const response = await auth.handler(
        new Request('http://localhost:3000/api/auth/sign-in/username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: result.admin.username, password }),
        }),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).user.companyId).toBe(result.company.id);
    });

    it('creates regular users only in the authenticated admin company', async () => {
      const { company, admin } = await createCompany(input());
      const body = {
        name: 'Ana Silva',
        username: `ana+silva@${company.usernameSuffix}`,
        password,
      };
      const created = await users.create(admin.id, body);
      expect(created.companyId).toBe(company.id);
      await expect(
        users.create(admin.id, { ...body, username: 'ana+silva@outraempresa' }),
      ).rejects.toThrow('sua empresa');
      await expect(
        users.create(created.id, {
          ...body,
          username: `joao+silva@${company.usernameSuffix}`,
        }),
      ).rejects.toThrow('Somente o administrador');
      await expect(
        users.create(admin.id, { ...body, username: admin.username }),
      ).rejects.toThrow('exclusivamente pelo sistema');
    });

    it('rejects duplicate normalized company suffixes', async () => {
      await createCompany(input('Colisão Ltda'));
      await expect(createCompany(input('Colisao Ltda.'))).rejects.toThrow(
        'já cadastrado',
      );
    });

    it('rolls back company and admin when credential creation fails', async () => {
      await pool.query(
        "CREATE FUNCTION reject_test_account() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'credential failure'; END $$; CREATE TRIGGER reject_test_account BEFORE INSERT ON account FOR EACH ROW EXECUTE FUNCTION reject_test_account();",
      );
      const data = input('Rollback Empresa');
      try {
        await expect(createCompany(data)).rejects.toThrow();
        await expect(seedInitialCompany(db, data)).rejects.toThrow();
        expect(
          await db
            .select()
            .from(companySchema.companies)
            .where(eq(companySchema.companies.legalName, data.legalName)),
        ).toHaveLength(0);
        expect(
          await db
            .select()
            .from(authSchema.user)
            .where(eq(authSchema.user.username, 'admin@rollbackempresa')),
        ).toHaveLength(0);
      } finally {
        await pool.query(
          'DROP TRIGGER reject_test_account ON account; DROP FUNCTION reject_test_account();',
        );
      }
    });

    it('rejects a company without its admin at commit', async () => {
      const { adminPassword: _password, ...data } = input();
      await expect(
        db
          .insert(companySchema.companies)
          .values({ ...data, usernameSuffix: 'orphan' }),
      ).rejects.toThrow();
      expect(
        await db
          .select()
          .from(companySchema.companies)
          .where(eq(companySchema.companies.usernameSuffix, 'orphan')),
      ).toHaveLength(0);
    });

    it('prevents deleting the automatic administrator', async () => {
      const { admin } = await createCompany(input());
      await expect(
        db.delete(authSchema.user).where(eq(authSchema.user.id, admin.id)),
      ).rejects.toThrow();
      expect(
        await db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.id, admin.id)),
      ).toHaveLength(1);
    });

    it('seeds a complete super_admin with working login and preserves credentials on repeat', async () => {
      const data = {
        ...input('Seed Empresa'),
        email: 'seed@example.com',
        phone: '123456789',
        website: 'https://seed.example.com',
        complement: 'Sala 2',
        notes: 'Initial data',
      };
      const first = await seedInitialCompany(db, data);
      const repeated = await seedInitialCompany(db, {
        ...data,
        adminPassword: 'changed-password-123',
        name: 'Do not overwrite',
      });
      expect(first.created).toBe(true);
      expect(repeated).toEqual({
        ...first,
        created: false,
        installationCreated: false,
        sectors: first.sectors.map((sector) => ({
          ...sector,
          created: false,
          devices: sector.devices.map((device) => ({
            ...device,
            created: false,
          })),
        })),
      });
      expect(first.installationCreated).toBe(true);
      const [seedInstallation] = await db
        .select()
        .from(installationsSchema.installations)
        .where(eq(installationsSchema.installations.id, first.installationId));
      expect(seedInstallation).toMatchObject({
        companyId: first.companyId,
        city: data.city,
        street: data.street,
        name: 'Matriz - seedempresa',
      });
      const [company] = await db
        .select()
        .from(companySchema.companies)
        .where(eq(companySchema.companies.id, first.companyId));
      expect(company).toMatchObject({
        name: data.name,
        email: data.email,
        phone: data.phone,
        website: data.website,
        complement: data.complement,
        notes: data.notes,
      });
      const auth = betterAuth({
        ...authOptions,
        secret: 'integration-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
        baseURL: 'http://localhost:3000',
        database: drizzleAdapter(db, { provider: 'pg' }),
      });
      const response = await auth.handler(
        new Request('http://localhost:3000/api/auth/sign-in/username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: first.username, password }),
        }),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).user).toMatchObject({
        role: 'super_admin',
        companyId: first.companyId,
      });
    });

    it('serializes concurrent seeds and never promotes an existing admin implicitly', async () => {
      const data = input('Concurrent Seed');
      const results = await Promise.all([
        seedInitialCompany(db, data),
        seedInitialCompany(db, data),
      ]);
      expect(results.filter((result) => result.created)).toHaveLength(1);
      expect(results[0].companyId).toBe(results[1].companyId);
      expect(results[0].installationId).toBe(results[1].installationId);
      expect(results[0].sectors[0].devices[0].id).toBe(
        results[1].sectors[0].devices[0].id,
      );
      expect(
        results.filter((result) => result.sectors[0].devices[0].created),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.installationCreated),
      ).toHaveLength(1);
      const existingData = input();
      const existing = await createCompany(existingData);
      await expect(seedInitialCompany(db, existingData)).rejects.toMatchObject({
        status: 409,
      });
      expect((await users.findOne(rootId, existing.admin.id)).role).toBe(
        'admin',
      );
    });

    it('adds a missing seed installation without changing the existing company or credentials', async () => {
      const data = {
        ...input('Legacy Seed'),
        installation: {
          name: 'Seed Legacy Unit',
          city: 'Campinas',
          latitude: -22.9,
        },
      };
      const first = await seedInitialCompany(db, data);
      const before = await db
        .select()
        .from(authSchema.account)
        .innerJoin(
          authSchema.user,
          eq(authSchema.account.userId, authSchema.user.id),
        )
        .where(eq(authSchema.user.companyId, first.companyId));
      await db
        .delete(installationsSchema.installations)
        .where(eq(installationsSchema.installations.id, first.installationId));
      const second = await seedInitialCompany(db, {
        ...data,
        adminPassword: 'do-not-change-password',
      });
      expect(second).toMatchObject({
        created: false,
        installationCreated: true,
        companyId: first.companyId,
      });
      const [installation] = await db
        .select()
        .from(installationsSchema.installations)
        .where(eq(installationsSchema.installations.id, second.installationId));
      expect(installation).toMatchObject({
        name: 'Seed Legacy Unit',
        city: 'Campinas',
        latitude: -22.9,
        street: data.street,
        companyId: first.companyId,
      });
      const after = await db
        .select()
        .from(authSchema.account)
        .innerJoin(
          authSchema.user,
          eq(authSchema.account.userId, authSchema.user.id),
        )
        .where(eq(authSchema.user.companyId, first.companyId));
      expect(after).toEqual(before);
    });

    it('rolls back a new company and super_admin if the seed installation conflicts', async () => {
      const installation = { name: 'Shared Seed Installation' };
      await seedInitialCompany(db, {
        ...input('First Seed Owner'),
        installation,
      });
      const data = { ...input('Conflicting Seed Owner'), installation };
      await expect(seedInitialCompany(db, data)).rejects.toMatchObject({
        status: 409,
      });
      expect(
        await db
          .select()
          .from(companySchema.companies)
          .where(eq(companySchema.companies.taxId, data.taxId)),
      ).toHaveLength(0);
      expect(
        await db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.username, 'admin@conflictingseedowner')),
      ).toHaveLength(0);
    });

    it('seeds multiple sectors and adds only missing sectors on repeat', async () => {
      const data = {
        ...input('Sector Seed'),
        installation: {
          name: 'Sector Seed Unit',
          sectors: [
            {
              name: 'Sector Seed Production',
              description: 'Original',
              status: 'active',
            },
            { name: 'Sector Seed Office', status: 'inactive' },
          ],
        },
      };
      const first = await seedInitialCompany(db, data);
      expect(first.sectors).toHaveLength(2);
      expect(first.sectors.every((sector) => sector.created)).toBe(true);
      const records = await db
        .select()
        .from(sectorsSchema.sectors)
        .where(eq(sectorsSchema.sectors.installationId, first.installationId));
      expect(records.map((sector) => sector.status)).toEqual(
        expect.arrayContaining(['active', 'inactive']),
      );
      await db
        .delete(sectorsSchema.sectors)
        .where(eq(sectorsSchema.sectors.id, first.sectors[1].id));
      const repeated = await seedInitialCompany(db, {
        ...data,
        adminPassword: 'do-not-replace-password',
        installation: {
          ...data.installation,
          sectors: [
            {
              ...data.installation.sectors[0],
              description: 'Do not overwrite',
            },
            data.installation.sectors[1],
          ],
        },
      });
      expect(repeated).toMatchObject({
        created: false,
        installationCreated: false,
        companyId: first.companyId,
        installationId: first.installationId,
      });
      expect(repeated.sectors[0]).toEqual({
        ...first.sectors[0],
        created: false,
        devices: first.sectors[0].devices.map((device) => ({
          ...device,
          created: false,
        })),
      });
      expect(repeated.sectors[1].created).toBe(true);
      const [preserved] = await db
        .select()
        .from(sectorsSchema.sectors)
        .where(eq(sectorsSchema.sectors.id, first.sectors[0].id));
      expect(preserved.description).toBe('Original');
      const again = await seedInitialCompany(db, data);
      expect(again.sectors.every((sector) => !sector.created)).toBe(true);
    });

    it('rolls back the entire seed on a sector conflict and rejects invalid sector lists', async () => {
      const sector = { name: 'Exclusive Seed Sector' };
      await seedInitialCompany(db, {
        ...input('Sector Owner'),
        installation: { sectors: [sector] },
      });
      const data = {
        ...input('Conflicting Sector Owner'),
        installation: { sectors: [{ name: 'Rollback New Sector' }, sector] },
      };
      await expect(seedInitialCompany(db, data)).rejects.toMatchObject({
        status: 409,
      });
      expect(
        await db
          .select()
          .from(companySchema.companies)
          .where(eq(companySchema.companies.taxId, data.taxId)),
      ).toHaveLength(0);
      expect(
        await db
          .select()
          .from(installationsSchema.installations)
          .where(
            eq(
              installationsSchema.installations.name,
              'Matriz - conflictingsectorowner',
            ),
          ),
      ).toHaveLength(0);
      expect(
        await db
          .select()
          .from(sectorsSchema.sectors)
          .where(eq(sectorsSchema.sectors.name, 'Rollback New Sector')),
      ).toHaveLength(0);
      for (const list of [
        [],
        [sector, sector],
        'invalid',
        [{ name: 'Invalid Status', status: 'unknown' }],
      ]) {
        await expect(
          seedInitialCompany(db, {
            ...input(),
            installation: { sectors: list },
          }),
        ).rejects.toMatchObject({ status: 400 });
      }
    });

    it('seeds devices per sector and fills missing devices without overwriting existing data', async () => {
      const data = {
        ...input('Device Seed'),
        installation: {
          sectors: [
            {
              name: 'Device Seed Sector A',
              devices: [
                {
                  devicesType: 'ac',
                  name: 'Meter',
                  serialNumber: 'ORIGINAL',
                  version: '1.0',
                  macAddress: '00:11:22:33:44:55',
                },
                { devicesType: 'ac', name: 'Sensor', status: 'inactive' },
              ],
            },
            {
              name: 'Device Seed Sector B',
              devices: [{ devicesType: 'ac', name: 'Meter' }],
            },
          ],
        },
      };
      const first = await seedInitialCompany(db, data);
      expect(first.sectors.map((sector) => sector.devices.length)).toEqual([
        2, 1,
      ]);
      expect(first.sectors[0].devices[0].id).not.toBe(
        first.sectors[1].devices[0].id,
      );
      const [meter] = await db
        .select()
        .from(devicesSchema.devices)
        .where(eq(devicesSchema.devices.id, first.sectors[0].devices[0].id));
      expect(meter).toMatchObject({
        sectorId: first.sectors[0].id,
        serialNumber: 'ORIGINAL',
        version: '1.0',
        macAddress: '00:11:22:33:44:55',
      });
      await db
        .delete(devicesSchema.devices)
        .where(eq(devicesSchema.devices.id, first.sectors[0].devices[1].id));
      data.installation.sectors[0].devices[0].serialNumber = 'DO-NOT-OVERWRITE';
      const repeated = await seedInitialCompany(db, data);
      expect(repeated).toMatchObject({
        created: false,
        installationCreated: false,
      });
      expect(repeated.sectors.every((sector) => !sector.created)).toBe(true);
      expect(
        repeated.sectors[0].devices.map((device) => device.created),
      ).toEqual([false, true]);
      expect(repeated.sectors[1].devices[0].created).toBe(false);
      const [preserved] = await db
        .select()
        .from(devicesSchema.devices)
        .where(eq(devicesSchema.devices.id, meter.id));
      expect(preserved).toEqual(meter);
      const again = await seedInitialCompany(db, data);
      expect(
        again.sectors.every((sector) =>
          sector.devices.every((device) => !device.created),
        ),
      ).toBe(true);
    });

    it('rejects invalid seed devices and rolls back when existing device names are ambiguous', async () => {
      for (const devices of [
        [],
        'invalid',
        [{ name: 'Same' }, { name: 'Same' }],
        [{ name: 'Invalid', status: 'unknown' }],
      ]) {
        await expect(
          seedInitialCompany(db, {
            ...input(),
            installation: {
              sectors: [{ name: 'Invalid Seed Devices', devices }],
            },
          }),
        ).rejects.toMatchObject({ status: 400 });
      }
      const data = {
        ...input('Ambiguous Devices'),
        installation: {
          sectors: [
            {
              name: 'Ambiguous Seed Sector',
              devices: [{ devicesType: 'ac', name: 'Meter' }],
            },
          ],
        },
      };
      const first = await seedInitialCompany(db, data);
      await db
        .insert(devicesSchema.devices)
        .values({
          devicesType: 'ac',
          sectorId: first.sectors[0].id,
          name: 'Meter',
          status: 'active',
        });
      await expect(
        seedInitialCompany(db, {
          ...data,
          installation: {
            sectors: [
              {
                name: 'Ambiguous Seed Sector',
                devices: [
                  { devicesType: 'ac', name: 'Should Roll Back' },
                  { devicesType: 'ac', name: 'Meter' },
                ],
              },
            ],
          },
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await db
          .select()
          .from(devicesSchema.devices)
          .where(eq(devicesSchema.devices.name, 'Should Roll Back')),
      ).toHaveLength(0);
    });

    function installationInput() {
      return {
        name: `Unidade ${randomUUID()}`,
        zipcode: '01001000',
        country: 'Brasil',
        state: 'SP',
        city: 'São Paulo',
        district: 'Centro',
        street: 'Rua A',
        number: '10',
        latitude: -23.55,
        longitude: -46.63,
      };
    }

    it('supports multiple installations per company and both relational query directions', async () => {
      const { company, admin } = await createCompany(input());
      const first = await installationService.create(
        admin.id,
        installationInput(),
      );
      const second = await installationService.create(rootId, {
        ...installationInput(),
        companyId: company.id,
      });
      expect(first.companyId).toBe(company.id);
      expect(second.companyId).toBe(company.id);
      const related = await db.query.companies.findFirst({
        where: eq(companySchema.companies.id, company.id),
        with: { installations: true },
      });
      expect(related?.installations.map((item) => item.id)).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
      const installation = await db.query.installations.findFirst({
        where: eq(installationsSchema.installations.id, first.id),
        with: { company: true },
      });
      expect(installation?.company.id).toBe(company.id);
    });

    it('applies installation read and write permissions across companies', async () => {
      const a = await createCompany(input());
      const b = await createCompany(input());
      const own = await installationService.create(
        a.admin.id,
        installationInput(),
      );
      const other = await installationService.create(
        b.admin.id,
        installationInput(),
      );
      const reader = await users.create(a.admin.id, {
        name: 'Read Only',
        username: `read+only@${a.company.usernameSuffix}`,
        password,
      });
      for (const actor of [a.admin.id, reader.id]) {
        expect(
          (await installationService.findAll(actor)).map((item) => item.id),
        ).toEqual([own.id]);
        expect((await installationService.findOne(actor, own.id)).id).toBe(
          own.id,
        );
        await expect(
          installationService.findOne(actor, other.id),
        ).rejects.toMatchObject({ status: 403 });
      }
      for (const operation of [
        () => installationService.create(reader.id, installationInput()),
        () =>
          installationService.update(reader.id, own.id, { name: 'Forbidden' }),
        () => installationService.remove(reader.id, own.id),
        () =>
          installationService.create(a.admin.id, {
            ...installationInput(),
            companyId: b.company.id,
          }),
        () =>
          installationService.update(a.admin.id, other.id, {
            name: 'Forbidden',
          }),
        () => installationService.remove(a.admin.id, other.id),
      ])
        await expect(operation()).rejects.toMatchObject({ status: 403 });
      await expect(
        installationService.update(rootId, own.id, { companyId: b.company.id }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        installationService.create(a.admin.id, {
          ...installationInput(),
          latitude: 91,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(
        (
          await installationService.update(a.admin.id, own.id, {
            description: 'Updated',
          })
        ).description,
      ).toBe('Updated');
      expect(
        (await installationService.findAll(rootId)).map((item) => item.id),
      ).toEqual(expect.arrayContaining([own.id, other.id]));
      await installationService.remove(rootId, other.id);
      await expect(
        installationService.findOne(rootId, other.id),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('requires an existing company and cascades installations when it is deleted', async () => {
      const { company, admin } = await createCompany(input());
      const data = installationInput();
      await expect(
        installationService.create(rootId, {
          ...data,
          companyId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        db
          .insert(installationsSchema.installations)
          .values({ ...data, companyId: randomUUID(), status: 'active' }),
      ).rejects.toThrow();
      await expect(
        pool.query(
          'INSERT INTO installations (name, zipcode, country, state, city, district, street, number, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [
            data.name,
            data.zipcode,
            data.country,
            data.state,
            data.city,
            data.district,
            data.street,
            data.number,
            'active',
          ],
        ),
      ).rejects.toMatchObject({ code: '23502' });
      await installationService.create(admin.id, data);
      await service.remove(rootId, company.id);
      expect(
        await db
          .select()
          .from(installationsSchema.installations)
          .where(eq(installationsSchema.installations.companyId, company.id)),
      ).toHaveLength(0);
    });

    it('supports multiple sectors per installation and relations in both directions', async () => {
      const { company, admin } = await createCompany(input());
      const installation = await installationService.create(
        admin.id,
        installationInput(),
      );
      const first = await sectorService.create(admin.id, {
        installationId: installation.id,
        name: `Setor ${randomUUID()}`,
      });
      const second = await sectorService.create(rootId, {
        installationId: installation.id,
        name: `Setor ${randomUUID()}`,
      });
      expect(first.installationId).toBe(installation.id);
      expect(second.installationId).toBe(installation.id);
      const parent = await db.query.installations.findFirst({
        where: eq(installationsSchema.installations.id, installation.id),
        with: { sectors: true },
      });
      expect(parent?.sectors.map((item) => item.id)).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
      const child = await db.query.sectors.findFirst({
        where: eq(sectorsSchema.sectors.id, first.id),
        with: { installation: { with: { company: true } } },
      });
      expect(child?.installation.company.id).toBe(company.id);
    });

    it('scopes sector reads and mutations through the installation company', async () => {
      const a = await createCompany(input());
      const b = await createCompany(input());
      const installationA = await installationService.create(
        a.admin.id,
        installationInput(),
      );
      const installationB = await installationService.create(
        b.admin.id,
        installationInput(),
      );
      const own = await sectorService.create(a.admin.id, {
        installationId: installationA.id,
        name: `Setor ${randomUUID()}`,
      });
      const other = await sectorService.create(rootId, {
        installationId: installationB.id,
        name: `Setor ${randomUUID()}`,
      });
      const reader = await users.create(a.admin.id, {
        name: 'Read Only',
        username: `read+only@${a.company.usernameSuffix}`,
        password,
      });
      for (const actorId of [a.admin.id, reader.id]) {
        expect(
          (await sectorService.findAll(actorId)).map((item) => item.id),
        ).toEqual([own.id]);
        expect((await sectorService.findOne(actorId, own.id)).id).toBe(own.id);
        await expect(
          sectorService.findOne(actorId, other.id),
        ).rejects.toMatchObject({ status: 403 });
      }
      for (const operation of [
        () =>
          sectorService.create(reader.id, {
            installationId: installationA.id,
            name: 'Forbidden',
          }),
        () => sectorService.update(reader.id, own.id, { name: 'Forbidden' }),
        () => sectorService.remove(reader.id, own.id),
        () =>
          sectorService.create(a.admin.id, {
            installationId: installationB.id,
            name: 'Forbidden',
          }),
        () => sectorService.update(a.admin.id, other.id, { name: 'Forbidden' }),
        () => sectorService.remove(a.admin.id, other.id),
      ])
        await expect(operation()).rejects.toMatchObject({ status: 403 });
      await expect(
        sectorService.update(rootId, own.id, {
          installationId: installationB.id,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        sectorService.create(rootId, {
          installationId: installationA.id,
          name: 'Invalid',
          status: 'unknown',
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        sectorService.create(rootId, {
          installationId: installationA.id,
          name: own.name,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (
          await sectorService.update(a.admin.id, own.id, {
            description: 'Updated',
            status: 'inactive',
          })
        ).status,
      ).toBe('inactive');
      expect(
        (await sectorService.findAll(rootId)).map((item) => item.id),
      ).toEqual(expect.arrayContaining([own.id, other.id]));
      await sectorService.remove(rootId, other.id);
      await expect(
        sectorService.findOne(rootId, other.id),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('requires an existing installation and cascades sectors on installation or company deletion', async () => {
      await expect(
        sectorService.create(rootId, {
          installationId: randomUUID(),
          name: 'Missing parent',
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        pool.query('INSERT INTO sectors (name, status) VALUES ($1, $2)', [
          'No installation',
          'active',
        ]),
      ).rejects.toMatchObject({ code: '23502' });
      await expect(
        db.insert(sectorsSchema.sectors).values({
          installationId: randomUUID(),
          name: 'Unknown installation',
          status: 'active',
        }),
      ).rejects.toThrow();
      const { company, admin } = await createCompany(input());
      const first = await installationService.create(
        admin.id,
        installationInput(),
      );
      const second = await installationService.create(
        admin.id,
        installationInput(),
      );
      const sectorA = await sectorService.create(admin.id, {
        installationId: first.id,
        name: `Setor ${randomUUID()}`,
      });
      const sectorB = await sectorService.create(admin.id, {
        installationId: second.id,
        name: `Setor ${randomUUID()}`,
      });
      await installationService.remove(admin.id, first.id);
      expect(
        await db
          .select()
          .from(sectorsSchema.sectors)
          .where(eq(sectorsSchema.sectors.id, sectorA.id)),
      ).toHaveLength(0);
      expect((await sectorService.findOne(admin.id, sectorB.id)).id).toBe(
        sectorB.id,
      );
      await service.remove(rootId, company.id);
      expect(
        await db
          .select()
          .from(sectorsSchema.sectors)
          .where(eq(sectorsSchema.sectors.id, sectorB.id)),
      ).toHaveLength(0);
    });

    async function deviceParent() {
      const { company, admin } = await createCompany(input());
      const installation = await installationService.create(
        admin.id,
        installationInput(),
      );
      const sector = await sectorService.create(admin.id, {
        installationId: installation.id,
        name: `Setor ${randomUUID()}`,
      });
      return { company, admin, installation, sector };
    }

    it('supports multiple devices per sector and queries both relation directions', async () => {
      const parent = await deviceParent();
      const first = await deviceService.create(parent.admin.id, {
        devicesType: 'ac',
        sectorId: parent.sector.id,
        name: 'Medidor 1',
        serialNumber: 'SN-1',
        version: '1.0',
        macAddress: '00:11:22:33:44:55',
      });
      const second = await deviceService.create(rootId, {
        devicesType: 'ac',
        sectorId: parent.sector.id,
        name: 'Medidor 2',
      });
      expect(first).toMatchObject({
        sectorId: parent.sector.id,
        serialNumber: 'SN-1',
        version: '1.0',
        macAddress: '00:11:22:33:44:55',
        status: 'active',
      });
      const related = await db.query.sectors.findFirst({
        where: eq(sectorsSchema.sectors.id, parent.sector.id),
        with: { devices: true },
      });
      expect(related?.devices.map((item) => item.id)).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
      const child = await db.query.devices.findFirst({
        where: eq(devicesSchema.devices.id, first.id),
        with: {
          sector: { with: { installation: { with: { company: true } } } },
        },
      });
      expect(child?.sector.installation.company.id).toBe(parent.company.id);
    });

    it('scopes devices through sector and installation and enforces all roles', async () => {
      const a = await deviceParent();
      const b = await deviceParent();
      const own = await deviceService.create(a.admin.id, {
        devicesType: 'ac',
        sectorId: a.sector.id,
        name: 'Own Device',
      });
      const other = await deviceService.create(b.admin.id, {
        devicesType: 'ac',
        sectorId: b.sector.id,
        name: 'Other Device',
      });
      const reader = await users.create(a.admin.id, {
        name: 'Read Only',
        username: `read+only@${a.company.usernameSuffix}`,
        password,
      });
      for (const actorId of [a.admin.id, reader.id]) {
        expect(
          (await deviceService.findAll(actorId)).map((item) => item.id),
        ).toEqual([own.id]);
        expect((await deviceService.findOne(actorId, own.id)).id).toBe(own.id);
        await expect(
          deviceService.findOne(actorId, other.id),
        ).rejects.toMatchObject({ status: 403 });
      }
      for (const operation of [
        () =>
          deviceService.create(reader.id, {
            devicesType: 'ac',
            sectorId: a.sector.id,
            name: 'Forbidden',
          }),
        () => deviceService.update(reader.id, own.id, { name: 'Forbidden' }),
        () => deviceService.remove(reader.id, own.id),
        () =>
          deviceService.create(a.admin.id, {
            devicesType: 'ac',
            sectorId: b.sector.id,
            name: 'Forbidden',
          }),
        () => deviceService.update(a.admin.id, other.id, { name: 'Forbidden' }),
        () => deviceService.remove(a.admin.id, other.id),
      ])
        await expect(operation()).rejects.toMatchObject({ status: 403 });
      await expect(
        deviceService.update(rootId, own.id, { sectorId: b.sector.id }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        deviceService.create(rootId, {
          devicesType: 'ac',
          sectorId: a.sector.id,
          name: 'Invalid',
          status: 'unknown',
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(
        (
          await deviceService.update(a.admin.id, own.id, {
            serialNumber: 'UPDATED',
            status: 'inactive',
          })
        ).serialNumber,
      ).toBe('UPDATED');
      expect(
        (await deviceService.findAll(rootId)).map((item) => item.id),
      ).toEqual(expect.arrayContaining([own.id, other.id]));
      await deviceService.remove(rootId, other.id);
      await expect(
        deviceService.findOne(rootId, other.id),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('requires an existing sector and cascades devices across the hierarchy', async () => {
      await expect(
        deviceService.create(rootId, {
          devicesType: 'ac',
          sectorId: randomUUID(),
          name: 'Unknown Sector',
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        pool.query('INSERT INTO devices (name, status) VALUES ($1, $2)', [
          'Missing Sector',
          'active',
        ]),
      ).rejects.toMatchObject({ code: '23502' });
      await expect(
        db
          .insert(devicesSchema.devices)
          .values({
            devicesType: 'ac',
            sectorId: randomUUID(),
            name: 'Invalid FK',
            status: 'active',
          }),
      ).rejects.toThrow();
      for (const level of ['sector', 'installation', 'company']) {
        const parent = await deviceParent();
        const device = await deviceService.create(parent.admin.id, {
          devicesType: 'ac',
          sectorId: parent.sector.id,
          name: 'Cascade Device',
        });
        if (level === 'sector')
          await sectorService.remove(parent.admin.id, parent.sector.id);
        else if (level === 'installation')
          await installationService.remove(
            parent.admin.id,
            parent.installation.id,
          );
        else await service.remove(rootId, parent.company.id);
        expect(
          await db
            .select()
            .from(devicesSchema.devices)
            .where(eq(devicesSchema.devices.id, device.id)),
        ).toHaveLength(0);
      }
    });

    it('requires devicesType in the API and database and accepts only the existing enum', async () => {
      const parent = await deviceParent();
      for (const devicesType of [undefined, null, '', 'unknown', 1]) {
        await expect(
          deviceService.create(parent.admin.id, {
            sectorId: parent.sector.id,
            name: 'Invalid Type',
            devicesType,
          }),
        ).rejects.toMatchObject({ status: 400 });
      }
      for (const devicesType of ['ac', 'dc', 'env', 'act', 'adv']) {
        const created = await deviceService.create(parent.admin.id, {
          sectorId: parent.sector.id,
          name: `Type ${devicesType}`,
          devicesType,
        });
        expect(created.devicesType).toBe(devicesType);
        expect(
          (
            await deviceService.update(parent.admin.id, created.id, {
              name: 'Preserved Type',
            })
          ).devicesType,
        ).toBe(devicesType);
      }
      const device = await deviceService.create(parent.admin.id, {
        sectorId: parent.sector.id,
        name: 'Editable Type',
        devicesType: 'ac',
      });
      expect(
        (
          await deviceService.update(parent.admin.id, device.id, {
            devicesType: 'dc',
          })
        ).devicesType,
      ).toBe('dc');
      await expect(
        deviceService.update(parent.admin.id, device.id, { devicesType: null }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        pool.query(
          'INSERT INTO devices (sector_id, name, status) VALUES ($1, $2, $3)',
          [parent.sector.id, 'No Type', 'active'],
        ),
      ).rejects.toMatchObject({ code: '23502', column: 'devices_type' });
      await expect(
        pool.query(
          'INSERT INTO devices (sector_id, name, status, devices_type) VALUES ($1, $2, $3, $4)',
          [parent.sector.id, 'Wrong Type', 'active', 'unknown'],
        ),
      ).rejects.toMatchObject({ code: '22P02' });
    });

    it('rejects a user without a company', async () => {
      await expect(
        pool.query(
          'INSERT INTO "user" (id, name, email, username) VALUES ($1, $2, $3, $4)',
          [
            randomUUID(),
            'Ana',
            `${randomUUID()}@users.invalid`,
            'ana+silva@empresa',
          ],
        ),
      ).rejects.toMatchObject({ code: '23502' });
    });

    it('limits admin and user reads to their company while super_admin sees every company', async () => {
      const a = await createCompany(input());
      const b = await createCompany(input());
      const reader = await users.create(a.admin.id, {
        name: 'Read Only',
        username: `read+only@${a.company.usernameSuffix}`,
        password,
      });
      expect(reader.role).toBe('user');
      for (const actorId of [reader.id, a.admin.id]) {
        expect(
          (await service.findAll(actorId)).map((company) => company.id),
        ).toEqual([a.company.id]);
        expect(
          (await users.findAll(actorId)).every(
            (member) => member.companyId === a.company.id,
          ),
        ).toBe(true);
        await expect(
          service.findOne(actorId, b.company.id),
        ).rejects.toMatchObject({ status: 403 });
        await expect(users.findOne(actorId, b.admin.id)).rejects.toMatchObject({
          status: 403,
        });
      }
      expect(
        (await service.findAll(rootId)).map((company) => company.id),
      ).toEqual(expect.arrayContaining([a.company.id, b.company.id]));
      expect((await users.findAll(rootId)).map((member) => member.id)).toEqual(
        expect.arrayContaining([a.admin.id, b.admin.id]),
      );
      expect((await service.findOne(reader.id, a.company.id)).id).toBe(
        a.company.id,
      );
    });

    it('denies every business mutation to user and company creation to admin', async () => {
      const { company, admin } = await createCompany(input());
      const reader = await users.create(admin.id, {
        name: 'Read Only',
        username: `read+only@${company.usernameSuffix}`,
        password,
      });
      for (const operation of [
        () =>
          users.create(reader.id, {
            name: 'Other User',
            username: `other+user@${company.usernameSuffix}`,
            password,
          }),
        () => users.update(reader.id, reader.id, { name: 'New Name' }),
        () => users.remove(reader.id, admin.id),
        () => service.update(reader.id, company.id, { name: 'Changed' }),
        () => service.remove(reader.id, company.id),
        () => service.create(reader.id, input()),
        () => service.create(admin.id, input()),
      ])
        await expect(operation()).rejects.toMatchObject({ status: 403 });
      expect((await users.findOne(rootId, reader.id)).name).toBe('Read Only');
    });

    it('allows admin roles independent of username and only within their company', async () => {
      const a = await createCompany(input());
      const b = await createCompany(input());
      const manager = await users.create(a.admin.id, {
        name: 'Ana Silva',
        username: `ana+silva@${a.company.usernameSuffix}`,
        password,
        role: 'admin',
      });
      expect(manager.role).toBe('admin');
      const employee = await users.create(manager.id, {
        name: 'Joao Silva',
        username: `joao+silva@${a.company.usernameSuffix}`,
        password,
      });
      expect(
        (
          await users.update(manager.id, employee.id, {
            role: 'admin',
            name: 'Joao Updated',
          })
        ).role,
      ).toBe('admin');
      expect(
        (
          await service.update(manager.id, a.company.id, {
            name: 'Managed Company',
          })
        ).name,
      ).toBe('Managed Company');
      for (const operation of [
        () => service.update(manager.id, b.company.id, { name: 'Forbidden' }),
        () => service.remove(manager.id, b.company.id),
        () => users.update(manager.id, b.admin.id, { name: 'Forbidden' }),
        () => users.remove(manager.id, b.admin.id),
        () =>
          users.create(manager.id, {
            name: 'Cross Tenant',
            username: `cross+tenant@${b.company.usernameSuffix}`,
            companyId: b.company.id,
            password,
          }),
      ])
        await expect(operation()).rejects.toMatchObject({ status: 403 });
      await users.remove(manager.id, employee.id);
      await expect(users.findOne(rootId, employee.id)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('prevents admin escalation and protects super_admin accounts even inside their company', async () => {
      const { company, admin } = await createCompany(input());
      const data = {
        name: 'Global User',
        username: `global+user@${company.usernameSuffix}`,
        password,
        role: 'super_admin',
      };
      await expect(users.create(admin.id, data)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        users.update(admin.id, admin.id, { role: 'super_admin' }),
      ).rejects.toMatchObject({ status: 403 });
      const global = await users.create(rootId, {
        ...data,
        companyId: company.id,
      });
      for (const operation of [
        () => users.update(admin.id, global.id, { role: 'user' }),
        () =>
          users.update(admin.id, global.id, { password: 'attacker-password' }),
        () => users.remove(admin.id, global.id),
        () => service.remove(admin.id, company.id),
      ])
        await expect(operation()).rejects.toMatchObject({ status: 403 });
      expect(
        (await users.update(rootId, global.id, { role: 'admin' })).role,
      ).toBe('admin');
    });

    it('revokes sessions on role changes and checks the current database role', async () => {
      const { company, admin } = await createCompany(input());
      const manager = await users.create(admin.id, {
        name: 'Manager User',
        username: `manager+user@${company.usernameSuffix}`,
        password,
        role: 'admin',
      });
      await db.insert(authSchema.session).values({
        id: randomUUID(),
        userId: manager.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
        updatedAt: new Date(),
      });
      await users.update(admin.id, manager.id, { role: 'user' });
      expect(
        await db
          .select()
          .from(authSchema.session)
          .where(eq(authSchema.session.userId, manager.id)),
      ).toHaveLength(0);
      await expect(
        service.update(manager.id, company.id, { name: 'No longer allowed' }),
      ).rejects.toMatchObject({ status: 403 });
      expect((await users.findOne(manager.id, manager.id)).role).toBe('user');
    });

    it('rejects mass assignment and preserves the automatic administrator role', async () => {
      const { company, admin } = await createCompany(input());
      await expect(
        users.update(rootId, admin.id, { role: 'user' }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        users.update(admin.id, admin.id, { companyId: randomUUID() }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        users.update(rootId, admin.id, { role: 'owner' }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.update(admin.id, company.id, { usernameSuffix: 'hijacked' }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        db
          .update(authSchema.user)
          .set({ role: 'user' })
          .where(eq(authSchema.user.id, admin.id)),
      ).rejects.toThrow();
      expect((await users.findOne(rootId, admin.id)).role).toBe('admin');
    });

    it('deletes a managed company and its accounts and sessions atomically', async () => {
      const { company, admin } = await createCompany(input());
      await service.remove(admin.id, company.id);
      expect(
        await db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.companyId, company.id)),
      ).toHaveLength(0);
      expect(
        await db
          .select()
          .from(authSchema.account)
          .where(eq(authSchema.account.userId, admin.id)),
      ).toHaveLength(0);
      await expect(service.findOne(rootId, company.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  },
);

import { HttpException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { inputObject } from '../common/input.js';
import { seedInitialCompany } from './seed.js';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL.');
  if (!process.env.SEED_ADMIN_PASSWORD)
    throw new Error('Defina SEED_ADMIN_PASSWORD (8 a 128 caracteres).');
  if (process.argv.length > 3)
    throw new Error('Uso: npm run db:seed -- caminho/empresa.json');
  const file = process.argv[2] ?? 'seed/company.example.json';
  const data = inputObject(JSON.parse(await readFile(file, 'utf8')));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await seedInitialCompany(drizzle(pool), {
      ...data,
      adminPassword: process.env.SEED_ADMIN_PASSWORD,
    });
    console.log(
      result.created
        ? 'Empresa, super_admin, instalação, setores e devices criados.'
        : result.installationCreated
          ? 'Instalação, setores e devices criados; empresa, usuário e senha preservados.'
          : result.sectors.some((sector) => sector.created)
            ? 'Setores e devices faltantes criados; dados existentes e senha preservados.'
            : result.sectors.some((sector) =>
                  sector.devices.some((device) => device.created),
                )
              ? 'Devices faltantes criados; dados existentes e senha preservados.'
              : 'Seed já aplicado; dados e senha preservados.',
    );
    console.log(
      `Empresa: ${result.companyId}\nUsername: ${result.username}\nRole: ${result.role}\nInstalação: ${result.installationId}`,
    );
    for (const sector of result.sectors) {
      console.log(
        `Setor: ${sector.name} (${sector.id}) — ${sector.created ? 'criado' : 'existente'}`,
      );
      for (const device of sector.devices)
        console.log(
          `  Device: ${device.name} (${device.id}) — ${device.created ? 'criado' : 'existente'}`,
        );
    }
  } catch (error) {
    // Drizzle errors may contain query parameters. Do not print credentials or hashes.
    throw new Error(
      error instanceof HttpException
        ? error.message
        : 'Falha ao executar o seed. Verifique a conexão e aplique as migrações antes de tentar novamente.',
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Falha ao executar o seed.',
  );
  process.exitCode = 1;
});

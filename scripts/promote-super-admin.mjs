import { Pool } from 'pg';

// Local operator command only. No public endpoint or implicit first-user promotion.
const username = process.argv[2]?.trim().toLowerCase();
if (!username || process.argv.length !== 3) {
  throw new Error('Uso: npm run roles:promote -- admin@empresa');
}
if (!process.env.DATABASE_URL)
  throw new Error('Defina DATABASE_URL antes de executar.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query(
    'UPDATE "user" SET role = $1, updated_at = now() WHERE username = $2 RETURNING id, username',
    ['super_admin', username],
  );
  if (rows.length !== 1)
    throw new Error('Username não encontrado. Nenhuma conta foi alterada.');
  await client.query('DELETE FROM session WHERE user_id = $1', [rows[0].id]);
  await client.query('COMMIT');
  console.log(
    `${rows[0].username} promovido a super_admin. Faça login novamente.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}

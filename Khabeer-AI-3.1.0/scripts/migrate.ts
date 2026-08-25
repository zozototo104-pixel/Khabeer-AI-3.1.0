import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pool } from '../src/db/index.ts';

async function migrate() {
  const migrationsDir = path.join(process.cwd(), 'migrations');
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum_sha256 text NOT NULL,
      applied_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await pool.query("SELECT pg_advisory_lock(hashtext('smart-expert-enterprise-migrations'))");

  try {
    for (const file of files) {
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await pool.query(
        'SELECT checksum_sha256 FROM schema_migrations WHERE filename = $1',
        [file],
      );

      if (existing.rowCount) {
        if (existing.rows[0].checksum_sha256 !== checksum) {
          throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${file}`);
        }
        console.log(`Skipping ${file}; already applied.`);
        continue;
      }

      const transactionalSql = sql
        .replace(/^\s*BEGIN;\s*/i, '')
        .replace(/\s*COMMIT;\s*$/i, '');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        console.log(`Applying ${file}...`);
        await client.query(transactionalSql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum_sha256) VALUES ($1, $2)',
          [file, checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    console.log('Database migrations completed.');
  } finally {
    await pool.query("SELECT pg_advisory_unlock(hashtext('smart-expert-enterprise-migrations'))").catch(() => {});
  }
}

migrate()
  .catch((error) => {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });

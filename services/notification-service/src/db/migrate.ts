import fs from 'node:fs';
import path from 'node:path';
import { pool } from './index';

/**
 * Runs SQL migration files from the /migrations directory in order.
 * Tracks applied migrations in the schema_migrations table.
 * Safe to call multiple times — already-applied migrations are skipped.
 */
export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // Ensure tracking table exists first
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    VARCHAR(50) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace('.sql', '');
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1', [version]
      );
      if (rows.length > 0) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)', [version]
        );
        await client.query('COMMIT');
        console.log(`Migration applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err}`);
      }
    }
  } finally {
    client.release();
  }
}

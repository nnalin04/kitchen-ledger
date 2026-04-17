import fs from 'fs';
import path from 'path';
import { pool } from './index';

export async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, '../../migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const version = file.replace('.sql', '');
    const { rows } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [version],
    );
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await pool.query('COMMIT');
      console.log(`Applied migration: ${file}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }
}

import { Pool, PoolClient } from 'pg';
import { config } from '../config';

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * Run a query scoped to a tenant by setting the RLS session variable.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    // Use set_config() with a parameter rather than string interpolation to prevent SQL injection.
    // is_local=true scopes the setting to the current transaction, matching SET LOCAL semantics.
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    return await fn(client);
  } finally {
    client.release();
  }
}

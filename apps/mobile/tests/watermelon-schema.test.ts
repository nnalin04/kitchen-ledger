import { describe, it, expect } from 'vitest';
import { schema } from '../lib/watermelon/schema';

// appSchema returns { version, tables: Record<name, { columns: Record<name, col> }> }
type ColRecord = Record<string, { name: string; type: string; isIndexed?: boolean }>;
type TableRecord = { name: string; columns: ColRecord };
const tables = schema.tables as unknown as Record<string, TableRecord>;

describe('WatermelonDB schema', () => {
  it('includes all required tables', () => {
    expect(Object.keys(tables)).toContain('inventory_items');
    expect(Object.keys(tables)).toContain('waste_logs_pending');
    expect(Object.keys(tables)).toContain('count_session_items');
  });

  it('inventory_items has required columns', () => {
    const cols = Object.keys(tables['inventory_items'].columns);
    expect(cols).toContain('server_id');
    expect(cols).toContain('tenant_id');
    expect(cols).toContain('current_stock');
    expect(cols).toContain('par_level');
    expect(cols).toContain('storage_location');
    expect(cols).toContain('is_perishable');
  });

  it('waste_logs_pending has synced flag', () => {
    const cols = Object.keys(tables['waste_logs_pending'].columns);
    expect(cols).toContain('synced');
    expect(cols).toContain('logged_at');
    expect(cols).toContain('inventory_item_id');
  });

  it('count_session_items has count session reference', () => {
    const cols = Object.keys(tables['count_session_items'].columns);
    expect(cols).toContain('count_session_id');
    expect(cols).toContain('counted_quantity');
    expect(cols).toContain('synced');
  });

  it('indexed columns are marked isIndexed', () => {
    const tenantCol = tables['inventory_items'].columns['tenant_id'];
    expect(tenantCol?.isIndexed).toBe(true);
  });
});

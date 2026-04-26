import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'inventory_items',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'tenant_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'category', type: 'string' },
        { name: 'abc_category', type: 'string' },
        { name: 'current_stock', type: 'number' },
        { name: 'par_level', type: 'number' },
        { name: 'count_unit', type: 'string' },
        { name: 'storage_location', type: 'string' },
        { name: 'is_perishable', type: 'boolean' },
        { name: 'avg_cost', type: 'number' },
        { name: 'synced_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'waste_logs_pending',
      columns: [
        { name: 'inventory_item_id', type: 'string', isIndexed: true },
        { name: 'quantity', type: 'number' },
        { name: 'unit', type: 'string' },
        { name: 'reason', type: 'string' },
        { name: 'station', type: 'string', isOptional: true },
        { name: 'photo_url', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'logged_at', type: 'number' },
        { name: 'synced', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'count_session_items',
      columns: [
        { name: 'count_session_id', type: 'string', isIndexed: true },
        { name: 'inventory_item_id', type: 'string', isIndexed: true },
        { name: 'server_count_item_id', type: 'string' },
        { name: 'counted_quantity', type: 'number' },
        { name: 'unit', type: 'string' },
        { name: 'synced', type: 'boolean' },
      ],
    }),
  ],
});

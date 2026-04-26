import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { InventoryItem, WasteLogPending, CountSessionItem } from './models';

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'kitchenledger',
  jsi: true,
  onSetUpError: (error) => {
    console.error('WatermelonDB setup error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [InventoryItem, WasteLogPending, CountSessionItem],
});

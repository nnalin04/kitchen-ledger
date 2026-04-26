import { synchronize } from '@nozbe/watermelondb/sync';
import NetInfo from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import { database } from './database';
import { apiClient } from '../api/client';

// Mutex flag — prevents concurrent sync runs from setInterval + AppState listener
// firing at the same time, which could cause duplicate pushes.
let isSyncing = false;

export async function syncDatabase(): Promise<void> {
  if (isSyncing) return;
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return;

  isSyncing = true;
  try {
  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      const ts = lastPulledAt ?? 0;
      const response = await apiClient.get(`/api/inventory/sync/pull?last_pulled_at=${ts}`);
      return response.data;
    },
    pushChanges: async ({ changes }) => {
      const wasteLogs = changes.waste_logs_pending?.created ?? [];
      const countItems = changes.count_session_items?.updated ?? [];

      for (const log of wasteLogs) {
        try {
          await apiClient.post('/api/inventory/waste', {
            inventory_item_id: log.inventory_item_id,
            quantity: log.quantity,
            unit: log.unit,
            reason: log.reason,
            station: log.station,
            photo_url: log.photo_url,
            notes: log.notes,
            logged_at: new Date(log.logged_at).toISOString(),
          });
        } catch (e) {
          console.warn('Failed to push waste log:', log.id, e);
        }
      }

      for (const item of countItems) {
        try {
          await apiClient.patch(
            `/api/inventory/counts/${item.count_session_id}/items/${item.server_count_item_id}`,
            { counted_quantity: item.counted_quantity }
          );
        } catch (e) {
          console.warn('Failed to push count item:', item.id, e);
        }
      }
    },
    migrationsEnabledAtVersion: 1,
  });
  } finally {
    isSyncing = false;
  }
}

let syncInterval: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

export function startSyncScheduler(): void {
  syncInterval = setInterval(() => {
    syncDatabase().catch(console.warn);
  }, 5 * 60 * 1000);

  appStateSubscription = AppState.addEventListener(
    'change',
    (state: AppStateStatus) => {
      if (state === 'active') {
        syncDatabase().catch(console.warn);
      }
    }
  );
}

export function stopSyncScheduler(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  appStateSubscription?.remove();
  appStateSubscription = null;
}

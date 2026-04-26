import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../../lib/api/client';
import { WasteQuickLog } from '../../../components/inventory/WasteQuickLog';
import { VoiceInput } from '../../../components/inventory/VoiceInput';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';
import { format } from 'date-fns';

interface WasteLog {
  id: string;
  item_name: string;
  quantity: number;
  unit: string;
  reason: string;
  station?: string;
  logged_at: string;
  value_lost: number;
}

export default function WasteScreen() {
  const [logs, setLogs] = useState<WasteLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [prefilledData, setPrefilledData] = useState<Partial<WasteLog> | null>(null);

  const load = async () => {
    try {
      const { data } = await apiClient.get('/api/inventory/waste?hours=24');
      setLogs(data.items ?? []);
    } catch {}
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onVoiceResult = (parsed: any) => {
    setPrefilledData(parsed);
    setShowLog(true);
  };

  useEffect(() => { load(); }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Waste Log</Text>
        <Text style={styles.subtitle}>Last 24 hours</Text>
      </View>

      <VoiceInput commandType="waste" onResult={onVoiceResult} />

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>✅</Text>
              <Text style={styles.emptyTitle}>No waste logged today</Text>
              <Text style={styles.emptyText}>Tap + to log waste manually</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.logRow}>
            <View style={styles.logMain}>
              <Text style={styles.logItem}>{item.item_name}</Text>
              <Text style={styles.logMeta}>
                {item.quantity} {item.unit} · {item.reason}
                {item.station ? ` · ${item.station}` : ''}
              </Text>
              <Text style={styles.logTime}>
                {format(new Date(item.logged_at), 'h:mm a')}
              </Text>
            </View>
            <Text style={styles.logValue}>
              ${item.value_lost?.toFixed(2) ?? '—'}
            </Text>
          </View>
        )}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => { setPrefilledData(null); setShowLog(true); }}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <WasteQuickLog
        visible={showLog}
        onClose={() => setShowLog(false)}
        onSuccess={() => { setShowLog(false); load(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.md },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary },
  list: { paddingHorizontal: Spacing.md, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.sm },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  logRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  logMain: { flex: 1 },
  logItem: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  logMeta: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  logTime: { fontSize: FontSize.xs, color: Colors.textDisabled, marginTop: 2 },
  logValue: { fontSize: FontSize.base, fontWeight: '700', color: Colors.danger },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: Spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: Colors.danger,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  fabText: { fontSize: 28, color: Colors.textInverse, lineHeight: 32 },
});

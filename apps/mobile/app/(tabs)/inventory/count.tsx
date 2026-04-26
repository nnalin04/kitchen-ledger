import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';
import { format } from 'date-fns';

interface CountSession {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed';
  started_at: string;
  total_items: number;
  counted_items: number;
}

export default function CountScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<CountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await apiClient.get('/api/inventory/counts?status=pending,in_progress');
      setSessions(data.items ?? []);
    } catch {}
    setLoading(false);
  };

  const startNewCount = async () => {
    setCreating(true);
    try {
      const { data } = await apiClient.post('/api/inventory/counts', {
        name: `Count ${format(new Date(), 'MMM d, h:mm a')}`,
      });
      router.push({ pathname: '/(tabs)/inventory/count-session', params: { sessionId: data.id } });
    } catch (e: any) {
      Alert.alert('Error', 'Could not start count session.');
    } finally {
      setCreating(false);
    }
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Stock Counts</Text>
        <TouchableOpacity
          style={[styles.newBtn, creating && styles.newBtnDisabled]}
          onPress={startNewCount}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color={Colors.textInverse} size="small" />
          ) : (
            <Text style={styles.newBtnText}>+ New Count</Text>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyTitle}>No active count sessions</Text>
            <Text style={styles.emptyText}>Start a new count to begin</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.sessionCard}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/inventory/count-session',
                params: { sessionId: item.id },
              })
            }
          >
            <View style={styles.sessionTop}>
              <Text style={styles.sessionName}>{item.name}</Text>
              <View style={[styles.statusBadge, styles[`status_${item.status}`]]}>
                <Text style={styles.statusText}>
                  {item.status === 'in_progress' ? 'In Progress' : item.status === 'pending' ? 'Pending' : 'Done'}
                </Text>
              </View>
            </View>
            <View style={styles.sessionProgress}>
              <View style={styles.progressBg}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${item.total_items > 0 ? (item.counted_items / item.total_items) * 100 : 0}%` as any },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>
                {item.counted_items} / {item.total_items} counted
              </Text>
            </View>
            <Text style={styles.sessionDate}>
              {format(new Date(item.started_at), 'EEE, MMM d · h:mm a')}
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
  newBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    minWidth: 100,
    alignItems: 'center',
  },
  newBtnDisabled: { opacity: 0.6 },
  newBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
  empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.sm },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  sessionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  sessionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  status_pending: { backgroundColor: '#fef9c3' },
  status_in_progress: { backgroundColor: '#dbeafe' },
  status_completed: { backgroundColor: '#dcfce7' },
  statusText: { fontSize: FontSize.xs, fontWeight: '600' },
  sessionProgress: { gap: Spacing.xs },
  progressBg: { height: 6, backgroundColor: Colors.border, borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
  progressLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  sessionDate: { fontSize: FontSize.xs, color: Colors.textDisabled },
});

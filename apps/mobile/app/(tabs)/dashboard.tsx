import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../lib/api/client';
import { useAuthStore } from '../../stores/auth.store';
import { syncDatabase } from '../../lib/watermelon/sync';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';
import { format } from 'date-fns';

interface DashboardData {
  net_sales: number;
  cash_over_short: number;
  low_stock_count: number;
  critical_tasks_incomplete: number;
  last_synced_at: string | null;
}

const QUICK_ACTIONS = [
  { label: 'Log Waste', emoji: '🗑️', route: '/(tabs)/inventory/waste' },
  { label: 'Clock In/Out', emoji: '⏰', route: '/(tabs)/staff/clock' },
  { label: 'Log Expense', emoji: '🧾', route: '/(tabs)/finance/expense' },
  { label: 'Stock Count', emoji: '📋', route: '/(tabs)/inventory/count' },
] as const;

export default function DashboardScreen() {
  const router = useRouter();
  const { user, tenant } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = async () => {
    try {
      const { data: kpis } = await apiClient.get('/api/finance/dashboard/kpis');
      setData(kpis);
    } catch {
      // Show stale data if offline
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await syncDatabase();
    await load();
    setLastSync(new Date());
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good {getTimeOfDay()},</Text>
            <Text style={styles.name}>{user?.name ?? 'Chef'}</Text>
          </View>
          <Text style={styles.date}>{format(new Date(), 'EEE, MMM d')}</Text>
        </View>

        {/* KPI strip */}
        <View style={styles.kpiStrip}>
          <KPITile
            label="Net Sales"
            value={formatCurrency(data?.net_sales, tenant?.currency)}
            onPress={() => router.push('/(tabs)/finance')}
          />
          <KPITile
            label="Cash Over/Short"
            value={formatCurrency(data?.cash_over_short, tenant?.currency)}
            valueColor={
              data?.cash_over_short == null
                ? undefined
                : data.cash_over_short < 0
                ? Colors.danger
                : Colors.success
            }
          />
          <KPITile
            label="Low Stock"
            value={String(data?.low_stock_count ?? '—')}
            badge={data?.low_stock_count ? 'warn' : undefined}
            onPress={() => router.push('/(tabs)/inventory')}
          />
        </View>

        {/* Critical tasks */}
        {(data?.critical_tasks_incomplete ?? 0) > 0 && (
          <TouchableOpacity
            style={styles.taskAlert}
            onPress={() => router.push('/(tabs)/staff')}
            activeOpacity={0.85}
          >
            <Text style={styles.taskAlertEmoji}>⚠️</Text>
            <Text style={styles.taskAlertText}>
              {data!.critical_tasks_incomplete} critical task
              {data!.critical_tasks_incomplete !== 1 ? 's' : ''} incomplete
            </Text>
            <Text style={styles.taskAlertChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.quickCard}
              onPress={() => router.push(action.route as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.quickEmoji}>{action.emoji}</Text>
              <Text style={styles.quickLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {lastSync && (
          <Text style={styles.syncNote}>
            Last synced {format(lastSync, 'h:mm a')}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function KPITile({
  label,
  value,
  valueColor,
  badge,
  onPress,
}: {
  label: string;
  value: string;
  valueColor?: string;
  badge?: 'warn';
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.kpiTile}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
    >
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
      {badge === 'warn' && <View style={styles.warnDot} />}
    </TouchableOpacity>
  );
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function formatCurrency(val: number | undefined, currency = 'USD'): string {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(val);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.md, gap: Spacing.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  greeting: { fontSize: FontSize.sm, color: Colors.textSecondary },
  name: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
  date: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  kpiStrip: { flexDirection: 'row', gap: Spacing.sm },
  kpiTile: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  kpiLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
  kpiValue: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginTop: 4 },
  warnDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
  },
  taskAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  taskAlertEmoji: { fontSize: FontSize.base },
  taskAlertText: { flex: 1, fontSize: FontSize.sm, color: '#c2410c', fontWeight: '600' },
  taskAlertChevron: { fontSize: FontSize.xl, color: '#c2410c' },
  sectionTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  quickCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickEmoji: { fontSize: 32 },
  quickLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  syncNote: {
    fontSize: FontSize.xs,
    color: Colors.textDisabled,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});

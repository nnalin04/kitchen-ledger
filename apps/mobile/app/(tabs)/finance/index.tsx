import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';
import { format, subDays } from 'date-fns';

interface FinanceSummary {
  net_sales_week: number;
  top_expenses: { category: string; amount: number }[];
  pending_reconciliations: number;
  currency: string;
}

function fmt(val: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val);
}

export default function FinanceIndexScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await apiClient.get('/api/finance/dashboard/kpis');
      setSummary(data);
    } catch {}
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  useEffect(() => { load(); }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>Finance</Text>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>This Week's Net Sales</Text>
          <Text style={styles.kpiValue}>{fmt(summary?.net_sales_week ?? 0, summary?.currency)}</Text>
        </View>

        {(summary?.top_expenses?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Expenses</Text>
            {summary!.top_expenses.map((e) => (
              <View key={e.category} style={styles.expenseRow}>
                <Text style={styles.expenseCategory}>{e.category}</Text>
                <Text style={styles.expenseAmt}>{fmt(e.amount, summary?.currency)}</Text>
              </View>
            ))}
          </View>
        )}

        {(summary?.pending_reconciliations ?? 0) > 0 && (
          <TouchableOpacity style={styles.alertCard} onPress={() => router.push('/(tabs)/finance/daily-report')}>
            <Text style={styles.alertText}>
              {summary!.pending_reconciliations} DSR{summary!.pending_reconciliations > 1 ? 's' : ''} pending reconciliation
            </Text>
            <Text style={styles.alertChevron}>›</Text>
          </TouchableOpacity>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/(tabs)/finance/daily-report')}
          >
            <Text style={styles.actionEmoji}>📊</Text>
            <Text style={styles.actionLabel}>Daily Report</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/(tabs)/finance/expense')}
          >
            <Text style={styles.actionEmoji}>🧾</Text>
            <Text style={styles.actionLabel}>Log Expense</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.md, gap: Spacing.md },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
  kpiCard: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  kpiLabel: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  kpiValue: { fontSize: FontSize.xxxl, fontWeight: '800', color: Colors.textInverse, marginTop: Spacing.xs },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  expenseRow: { flexDirection: 'row', justifyContent: 'space-between' },
  expenseCategory: { fontSize: FontSize.sm, color: Colors.textSecondary },
  expenseAmt: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  alertCard: {
    flexDirection: 'row',
    backgroundColor: '#fff7ed',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#fed7aa',
    alignItems: 'center',
  },
  alertText: { flex: 1, fontSize: FontSize.sm, color: '#c2410c', fontWeight: '600' },
  alertChevron: { fontSize: FontSize.xl, color: '#c2410c' },
  actions: { flexDirection: 'row', gap: Spacing.md },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionEmoji: { fontSize: 32 },
  actionLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
});

import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';
import { format } from 'date-fns';

// ─── Types ──────────────────────────────────────────────────────────────────

type StepId = 0 | 1 | 2 | 3;

const STEP_LABELS = ['Cash', 'Digital', 'Expenses', 'Review'];

interface Expense {
  id: string;
  description: string;
  amount: string;
}

interface DSRData {
  date: string;
  // Step 0 — Cash
  cashSales: string;
  cashInDrawer: string;
  // Step 1 — Digital
  upiAmount: string;
  cardAmount: string;
  // Step 2 — Expenses
  expenses: Expense[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function num(s: string): number {
  const n = parseFloat(s.replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function makeExpense(): Expense {
  return { id: Math.random().toString(36).slice(2), description: '', amount: '' };
}

function emptyDSR(): DSRData {
  return {
    date: format(new Date(), 'yyyy-MM-dd'),
    cashSales: '',
    cashInDrawer: '',
    upiAmount: '',
    cardAmount: '',
    expenses: [],
  };
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MoneyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>
      {hint ? <Text style={fieldStyles.hint}>{hint}</Text> : null}
      <View style={fieldStyles.inputRow}>
        <Text style={fieldStyles.prefix}>₹</Text>
        <TextInput
          style={fieldStyles.input}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={Colors.textDisabled}
          returnKeyType="done"
        />
      </View>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrapper: { gap: Spacing.xs, marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  hint: { fontSize: FontSize.xs, color: Colors.textDisabled },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    height: 52,
  },
  prefix: { fontSize: FontSize.xl, color: Colors.textSecondary, marginRight: Spacing.sm },
  input: { flex: 1, fontSize: FontSize.xl, fontWeight: '600', color: Colors.textPrimary },
});

function SummaryRow({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
}) {
  return (
    <View style={summaryStyles.row}>
      <Text style={[summaryStyles.label, bold && summaryStyles.boldText]}>{label}</Text>
      <Text style={[summaryStyles.value, bold && summaryStyles.boldText, color ? { color } : null]}>
        {value}
      </Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary },
  value: { fontSize: FontSize.sm, color: Colors.textPrimary },
  boldText: { fontWeight: '700', fontSize: FontSize.base, color: Colors.textPrimary },
});

// ─── Step progress indicator ─────────────────────────────────────────────────

function StepIndicator({ current }: { current: StepId }) {
  return (
    <View style={indicatorStyles.row}>
      {STEP_LABELS.map((label, i) => (
        <View key={label} style={indicatorStyles.item}>
          <View
            style={[
              indicatorStyles.dot,
              i < current && indicatorStyles.dotDone,
              i === current && indicatorStyles.dotActive,
            ]}
          >
            {i < current ? (
              <Text style={indicatorStyles.check}>✓</Text>
            ) : (
              <Text
                style={[
                  indicatorStyles.num,
                  i === current && indicatorStyles.numActive,
                ]}
              >
                {i + 1}
              </Text>
            )}
          </View>
          <Text
            style={[
              indicatorStyles.label,
              i === current && indicatorStyles.labelActive,
            ]}
          >
            {label}
          </Text>
          {i < STEP_LABELS.length - 1 && (
            <View
              style={[indicatorStyles.line, i < current && indicatorStyles.lineDone]}
            />
          )}
        </View>
      ))}
    </View>
  );
}

const indicatorStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  item: { alignItems: 'center', flex: 1, gap: 4, position: 'relative' },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dotActive: { backgroundColor: Colors.primary },
  dotDone: { backgroundColor: Colors.success },
  check: { fontSize: FontSize.xs, color: Colors.textInverse, fontWeight: '700' },
  num: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  numActive: { color: Colors.textInverse },
  label: { fontSize: 10, color: Colors.textDisabled, textAlign: 'center' },
  labelActive: { color: Colors.primary, fontWeight: '600' },
  line: {
    position: 'absolute',
    top: 15,
    left: '50%',
    width: '100%',
    height: 2,
    backgroundColor: Colors.border,
    zIndex: 0,
  },
  lineDone: { backgroundColor: Colors.success },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DailyReportScreen() {
  const router = useRouter();
  const [step, setStep] = useState<StepId>(0);
  const [data, setData] = useState<DSRData>(emptyDSR());
  const [submitting, setSubmitting] = useState(false);
  const [newExpenseDesc, setNewExpenseDesc] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');

  // Reanimated slide values
  const translateX = useSharedValue(0);
  const contentOpacity = useSharedValue(1);

  const set = <K extends keyof DSRData>(key: K) =>
    (val: DSRData[K]) => setData((d) => ({ ...d, [key]: val }));

  // Derived values
  const discrepancy = num(data.cashInDrawer) - num(data.cashSales);
  const totalDigital = num(data.upiAmount) + num(data.cardAmount);
  const totalExpenses = data.expenses.reduce((s, e) => s + num(e.amount), 0);
  const grandTotal = num(data.cashSales) + totalDigital;

  // ── Animated navigation ──────────────────────────────────────────────────

  function animateToStep(nextStep: StepId, direction: 1 | -1) {
    const DISTANCE = 300;
    contentOpacity.value = withTiming(0, { duration: 120 }, () => {
      translateX.value = direction * DISTANCE;
      runOnJS(setStep)(nextStep);
      translateX.value = withTiming(0, { duration: 220 });
      contentOpacity.value = withTiming(1, { duration: 220 });
    });
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: contentOpacity.value,
  }));

  const goNext = () => {
    if (step < 3) animateToStep((step + 1) as StepId, 1);
  };

  const goBack = () => {
    if (step > 0) animateToStep((step - 1) as StepId, -1);
  };

  // ── Expense management ──────────────────────────────────────────────────

  const addExpense = () => {
    if (!newExpenseDesc.trim() && !newExpenseAmount) return;
    setData((d) => ({
      ...d,
      expenses: [
        ...d.expenses,
        { id: Math.random().toString(36).slice(2), description: newExpenseDesc.trim(), amount: newExpenseAmount },
      ],
    }));
    setNewExpenseDesc('');
    setNewExpenseAmount('');
  };

  const removeExpense = (id: string) => {
    setData((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) }));
  };

  // ── Submit ───────────────────────────────────────────────────────────────

  const submit = async () => {
    setSubmitting(true);
    const payload = {
      date: data.date,
      gross_sales: num(data.cashSales) + totalDigital,
      payment_breakdown: {
        cash: num(data.cashSales),
        upi: num(data.upiAmount),
        card: num(data.cardAmount),
      },
      cash_count_actual: num(data.cashInDrawer) || undefined,
      expenses: data.expenses.map((e) => ({
        description: e.description,
        amount: num(e.amount),
      })),
    };

    try {
      await apiClient.post('/api/finance/dsr', payload);
      Alert.alert('Submitted', 'Daily report saved successfully.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      const isOffline =
        err?.code === 'ECONNABORTED' ||
        err?.message?.includes('Network') ||
        !err?.response;

      if (isOffline) {
        Alert.alert(
          'Queued for Sync',
          'You appear to be offline. The report will be submitted automatically when you reconnect.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Error', err?.response?.data?.message ?? 'Failed to submit report.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render steps ──────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cash Sales</Text>
            <Text style={styles.cardDesc}>Enter today's total cash collected and the amount in the drawer.</Text>
            <MoneyField
              label="Cash Sales"
              value={data.cashSales}
              onChange={set('cashSales')}
            />
            <MoneyField
              label="Cash in Drawer"
              value={data.cashInDrawer}
              onChange={set('cashInDrawer')}
              hint="Physical count of notes + coins"
            />
            {(data.cashSales || data.cashInDrawer) && (
              <View
                style={[
                  styles.discrepancyBox,
                  Math.abs(discrepancy) > 100 && styles.discrepancyBoxDanger,
                ]}
              >
                <Text style={styles.discrepancyLabel}>Discrepancy</Text>
                <Text
                  style={[
                    styles.discrepancyValue,
                    Math.abs(discrepancy) > 100 && styles.discrepancyValueDanger,
                  ]}
                >
                  {discrepancy >= 0 ? '+' : ''}₹{fmt(discrepancy)}
                </Text>
                {Math.abs(discrepancy) > 100 && (
                  <Text style={styles.discrepancyNote}>
                    Cash discrepancy exceeds ₹100 — double-check the drawer count.
                  </Text>
                )}
              </View>
            )}
          </View>
        );

      case 1:
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Digital Payments</Text>
            <Text style={styles.cardDesc}>Enter amounts collected via UPI and card/POS.</Text>
            <MoneyField label="UPI / Wallet" value={data.upiAmount} onChange={set('upiAmount')} />
            <MoneyField label="Card / POS" value={data.cardAmount} onChange={set('cardAmount')} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Digital Total</Text>
              <Text style={styles.totalValue}>₹{fmt(totalDigital)}</Text>
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Expenses</Text>
            <Text style={styles.cardDesc}>Add any expenses incurred today (optional).</Text>

            {/* Expense list */}
            {data.expenses.map((e) => (
              <View key={e.id} style={styles.expenseRow}>
                <Text style={styles.expenseDesc} numberOfLines={1}>
                  {e.description || 'Unnamed expense'}
                </Text>
                <Text style={styles.expenseAmount}>₹{fmt(num(e.amount))}</Text>
                <TouchableOpacity onPress={() => removeExpense(e.id)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Text style={styles.removeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Add new expense */}
            <View style={styles.addExpenseRow}>
              <TextInput
                style={styles.expenseDescInput}
                placeholder="Description"
                placeholderTextColor={Colors.textDisabled}
                value={newExpenseDesc}
                onChangeText={setNewExpenseDesc}
                returnKeyType="next"
              />
              <View style={styles.expenseAmountWrap}>
                <Text style={styles.expensePrefix}>₹</Text>
                <TextInput
                  style={styles.expenseAmountInput}
                  placeholder="0"
                  placeholderTextColor={Colors.textDisabled}
                  value={newExpenseAmount}
                  onChangeText={setNewExpenseAmount}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={addExpense}
                />
              </View>
              <TouchableOpacity style={styles.addBtn} onPress={addExpense}>
                <Text style={styles.addBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {data.expenses.length > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Expenses</Text>
                <Text style={[styles.totalValue, { color: Colors.danger }]}>
                  ₹{fmt(totalExpenses)}
                </Text>
              </View>
            )}
          </View>
        );

      case 3:
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Review & Submit</Text>
            <Text style={styles.cardDesc}>Check all figures before submitting.</Text>

            <Text style={styles.summarySection}>CASH</Text>
            <SummaryRow label="Cash Sales" value={`₹${fmt(num(data.cashSales))}`} />
            <SummaryRow label="Cash in Drawer" value={`₹${fmt(num(data.cashInDrawer))}`} />
            <SummaryRow
              label="Discrepancy"
              value={`${discrepancy >= 0 ? '+' : ''}₹${fmt(discrepancy)}`}
              color={Math.abs(discrepancy) > 100 ? Colors.danger : Colors.success}
            />

            <View style={styles.divider} />

            <Text style={styles.summarySection}>DIGITAL</Text>
            <SummaryRow label="UPI / Wallet" value={`₹${fmt(num(data.upiAmount))}`} />
            <SummaryRow label="Card / POS" value={`₹${fmt(num(data.cardAmount))}`} />

            {data.expenses.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={styles.summarySection}>EXPENSES ({data.expenses.length})</Text>
                {data.expenses.map((e) => (
                  <SummaryRow
                    key={e.id}
                    label={e.description || 'Expense'}
                    value={`₹${fmt(num(e.amount))}`}
                  />
                ))}
                <SummaryRow
                  label="Total Expenses"
                  value={`₹${fmt(totalExpenses)}`}
                  color={Colors.danger}
                />
              </>
            )}

            <View style={styles.divider} />
            <SummaryRow
              label="Grand Total Sales"
              value={`₹${fmt(grandTotal)}`}
              bold
            />
            <SummaryRow
              label="Net (after expenses)"
              value={`₹${fmt(grandTotal - totalExpenses)}`}
              bold
              color={Colors.primary}
            />
          </View>
        );
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Daily Sales Report</Text>
          <Text style={styles.dateLabel}>{format(new Date(data.date), 'd MMM')}</Text>
        </View>

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* Animated step content */}
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={animatedStyle}>
            {renderStep()}
          </Animated.View>
        </ScrollView>

        {/* Navigation bar */}
        <View style={styles.navBar}>
          {step > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          {step < 3 ? (
            <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
              <Text style={styles.nextBtnText}>Next →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.disabled]}
              onPress={submit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.submitBtnText}>Submit Report</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  closeBtn: { fontSize: FontSize.xl, color: Colors.textSecondary, width: 40 },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  dateLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, width: 40, textAlign: 'right' },

  // Content
  scroll: { padding: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  cardDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },

  // Discrepancy
  discrepancyBox: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  discrepancyBoxDanger: {
    backgroundColor: '#fef2f2',
    borderColor: Colors.danger,
  },
  discrepancyLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  discrepancyValue: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.success,
  },
  discrepancyValueDanger: { color: Colors.danger },
  discrepancyNote: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    lineHeight: 16,
  },

  // Totals
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  totalLabel: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  totalValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.primary },

  // Expenses
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  expenseDesc: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  expenseAmount: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  removeBtn: { fontSize: FontSize.base, color: Colors.textDisabled },

  addExpenseRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  expenseDescInput: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  expenseAmountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    height: 44,
    width: 90,
  },
  expensePrefix: { fontSize: FontSize.sm, color: Colors.textSecondary },
  expenseAmountInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  addBtn: {
    width: 44,
    height: 44,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { fontSize: FontSize.xl, color: Colors.textInverse, fontWeight: '700', lineHeight: 24 },

  // Review
  summarySection: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textDisabled,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },

  // Nav
  navBar: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backBtn: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textSecondary },
  nextBtn: {
    flex: 2,
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
  submitBtn: {
    flex: 2,
    height: 52,
    backgroundColor: Colors.success,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
  disabled: { opacity: 0.6 },
});

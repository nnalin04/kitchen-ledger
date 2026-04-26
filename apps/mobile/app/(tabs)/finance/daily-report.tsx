import { useState } from 'react';
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
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';
import { format } from 'date-fns';

type Step = 'sales' | 'payments' | 'cash' | 'review';
const STEPS: Step[] = ['sales', 'payments', 'cash', 'review'];
const STEP_LABELS = ['Sales', 'Payments', 'Cash Count', 'Review'];

interface DSRData {
  date: string;
  gross_sales: string;
  food_sales: string;
  beverage_sales: string;
  other_sales: string;
  discounts: string;
  comps: string;
  voids: string;
  // Payments
  cash: string;
  card: string;
  upi: string;
  delivery: string;
  // Cash count
  cash_counted: string;
  // Tax
  tax_collected: string;
}

const emptyDSR = (): DSRData => ({
  date: format(new Date(), 'yyyy-MM-dd'),
  gross_sales: '',
  food_sales: '',
  beverage_sales: '',
  other_sales: '',
  discounts: '',
  comps: '',
  voids: '',
  cash: '',
  card: '',
  upi: '',
  delivery: '',
  cash_counted: '',
  tax_collected: '',
});

function num(s: string): number {
  return parseFloat(s || '0') || 0;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function Field({
  label,
  value,
  onChange,
  prefix = '$',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
}) {
  return (
    <View style={fieldStyles.row}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={fieldStyles.inputWrap}>
        <Text style={fieldStyles.prefix}>{prefix}</Text>
        <TextInput
          style={fieldStyles.input}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={Colors.textDisabled}
        />
      </View>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    height: 44,
    minWidth: 120,
  },
  prefix: { fontSize: FontSize.base, color: Colors.textSecondary, marginRight: 4 },
  input: { fontSize: FontSize.base, color: Colors.textPrimary, minWidth: 80 },
});

export default function DailyReportScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('sales');
  const [data, setData] = useState<DSRData>(emptyDSR());
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof DSRData) => (val: string) => setData((d) => ({ ...d, [key]: val }));

  const stepIndex = STEPS.indexOf(step);
  const netSales = num(data.gross_sales) - num(data.discounts) - num(data.comps) - num(data.voids);
  const paymentTotal = num(data.cash) + num(data.card) + num(data.upi) + num(data.delivery);
  const cashOverShort = num(data.cash_counted) - num(data.cash);

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await apiClient.post('/api/finance/daily-sales-reports', {
        date: data.date,
        gross_sales: num(data.gross_sales),
        food_sales: num(data.food_sales) || undefined,
        beverage_sales: num(data.beverage_sales) || undefined,
        other_sales: num(data.other_sales) || undefined,
        discounts: num(data.discounts),
        comps: num(data.comps),
        voids: num(data.voids),
        tax_collected: num(data.tax_collected),
        payment_breakdown: {
          cash: num(data.cash),
          card: num(data.card),
          upi: num(data.upi),
          delivery: num(data.delivery),
        },
        cash_count_actual: num(data.cash_counted) || undefined,
      });
      Alert.alert('Saved', 'Daily sales report submitted.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to save DSR.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Daily Sales Report</Text>
          <Text style={styles.date}>{data.date}</Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepRow}>
          {STEPS.map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepDot, i <= stepIndex && styles.stepDotActive]}>
                <Text style={[styles.stepNum, i <= stepIndex && styles.stepNumActive]}>
                  {i + 1}
                </Text>
              </View>
              <Text style={[styles.stepLabel, i === stepIndex && styles.stepLabelActive]}>
                {STEP_LABELS[i]}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step === 'sales' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sales Breakdown</Text>
              <Field label="Gross Sales" value={data.gross_sales} onChange={set('gross_sales')} />
              <Field label="Food Sales" value={data.food_sales} onChange={set('food_sales')} />
              <Field label="Beverage Sales" value={data.beverage_sales} onChange={set('beverage_sales')} />
              <Field label="Other Sales" value={data.other_sales} onChange={set('other_sales')} />
              <View style={styles.divider} />
              <Field label="Discounts" value={data.discounts} onChange={set('discounts')} />
              <Field label="Comps" value={data.comps} onChange={set('comps')} />
              <Field label="Voids" value={data.voids} onChange={set('voids')} />
              <Field label="Tax Collected" value={data.tax_collected} onChange={set('tax_collected')} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Net Sales</Text>
                <Text style={styles.totalValue}>${fmt(netSales)}</Text>
              </View>
            </View>
          )}

          {step === 'payments' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Payment Methods</Text>
              <Field label="Cash" value={data.cash} onChange={set('cash')} />
              <Field label="Card / POS" value={data.card} onChange={set('card')} />
              <Field label="UPI / Wallet" value={data.upi} onChange={set('upi')} />
              <Field label="Delivery Platforms" value={data.delivery} onChange={set('delivery')} />
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Payment Total</Text>
                <Text style={[styles.totalValue, Math.abs(paymentTotal - netSales) > 0.01 && { color: Colors.warning }]}>
                  ${fmt(paymentTotal)}
                </Text>
              </View>
              {Math.abs(paymentTotal - netSales) > 0.01 && (
                <Text style={styles.mismatchNote}>
                  ⚠ Payments (${fmt(paymentTotal)}) don't match Net Sales (${fmt(netSales)})
                </Text>
              )}
            </View>
          )}

          {step === 'cash' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Cash Count</Text>
              <Text style={styles.hint}>Count your cash drawer and enter the total below.</Text>
              <Field label="Expected Cash" value={fmt(num(data.cash))} onChange={() => {}} prefix="$" />
              <Field label="Actual Count" value={data.cash_counted} onChange={set('cash_counted')} />
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Over / Short</Text>
                <Text style={[
                  styles.totalValue,
                  cashOverShort > 0.01 && { color: Colors.success },
                  cashOverShort < -0.01 && { color: Colors.danger },
                ]}>
                  {cashOverShort >= 0 ? '+' : ''}{fmt(cashOverShort)}
                </Text>
              </View>
            </View>
          )}

          {step === 'review' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Review & Submit</Text>
              <SummaryRow label="Gross Sales" value={`$${fmt(num(data.gross_sales))}`} />
              <SummaryRow label="Net Sales" value={`$${fmt(netSales)}`} highlight />
              <SummaryRow label="Tax Collected" value={`$${fmt(num(data.tax_collected))}`} />
              <View style={styles.divider} />
              <SummaryRow label="Cash" value={`$${fmt(num(data.cash))}`} />
              <SummaryRow label="Card" value={`$${fmt(num(data.card))}`} />
              <SummaryRow label="UPI" value={`$${fmt(num(data.upi))}`} />
              <SummaryRow label="Delivery" value={`$${fmt(num(data.delivery))}`} />
              <View style={styles.divider} />
              <SummaryRow
                label="Cash Over/Short"
                value={`${cashOverShort >= 0 ? '+' : ''}$${fmt(cashOverShort)}`}
                highlight
                color={cashOverShort < -0.01 ? Colors.danger : cashOverShort > 0.01 ? Colors.success : undefined}
              />
            </View>
          )}
        </ScrollView>

        {/* Navigation */}
        <View style={styles.nav}>
          {stepIndex > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
          )}
          {step !== 'review' ? (
            <TouchableOpacity style={[styles.nextBtn, stepIndex === 0 && { flex: 1 }]} onPress={goNext}>
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

function SummaryRow({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, highlight && styles.summaryLabelBold]}>{label}</Text>
      <Text style={[styles.summaryValue, highlight && styles.summaryValueBold, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  back: { fontSize: FontSize.xl, color: Colors.textSecondary },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  date: { fontSize: FontSize.sm, color: Colors.textSecondary },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stepItem: { alignItems: 'center', gap: 4, flex: 1 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: Colors.primary },
  stepNum: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  stepNumActive: { color: Colors.textInverse },
  stepLabel: { fontSize: 10, color: Colors.textDisabled, textAlign: 'center' },
  stepLabelActive: { color: Colors.primary, fontWeight: '600' },
  scroll: { padding: Spacing.md, gap: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.sm },
  totalLabel: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  totalValue: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.primary },
  mismatchNote: { fontSize: FontSize.xs, color: Colors.warning, marginTop: Spacing.sm },
  hint: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  summaryLabelBold: { fontWeight: '700', color: Colors.textPrimary },
  summaryValue: { fontSize: FontSize.sm, color: Colors.textSecondary },
  summaryValueBold: { fontWeight: '700', color: Colors.textPrimary },
  nav: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
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
  backBtnText: { fontSize: FontSize.base, color: Colors.textSecondary, fontWeight: '600' },
  nextBtn: {
    flex: 2,
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: { fontSize: FontSize.base, color: Colors.textInverse, fontWeight: '700' },
  submitBtn: {
    flex: 2,
    height: 52,
    backgroundColor: Colors.success,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { fontSize: FontSize.base, color: Colors.textInverse, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});

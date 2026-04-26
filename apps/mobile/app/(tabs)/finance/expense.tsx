import { useState, useEffect } from 'react';
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';
import { format } from 'date-fns';

interface Account { id: string; name: string; type: string; }

export default function ExpenseScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [cameraRef, setCameraRef] = useState<any>(null);
  const [scanning, setScanning] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiClient.get('/api/finance/accounts').then(({ data }) => setAccounts(data.items ?? []));
  }, []);

  const captureAndOcr = async () => {
    if (!cameraRef) return;
    setScanning(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.8 });
      setShowCamera(false);

      const form = new FormData();
      form.append('image', { uri: photo.uri, type: 'image/jpeg', name: 'receipt.jpg' } as any);
      form.append('context_type', 'expense');
      form.append('target_date', date);

      const { data } = await apiClient.post('/api/ai/ocr/receipt', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (data.result?.expenses?.[0]) {
        const exp = data.result.expenses[0];
        if (exp.amount) setAmount(String(exp.amount));
        if (exp.payee) setVendor(exp.payee);
        if (exp.date) setDate(exp.date);
      }
    } catch {
      Alert.alert('OCR failed', 'Could not read receipt. Enter manually.');
    } finally {
      setScanning(false);
    }
  };

  const submit = async () => {
    if (!selectedAccount || !amount || !vendor) {
      Alert.alert('Missing fields', 'Select account, amount, and vendor.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/api/finance/expenses', {
        account_id: selectedAccount.id,
        amount: parseFloat(amount),
        vendor_name: vendor,
        date,
        notes: notes || undefined,
      });
      Alert.alert('Saved', 'Expense logged.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to save expense.');
    } finally {
      setSubmitting(false);
    }
  };

  if (showCamera) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView style={{ flex: 1 }} ref={setCameraRef} facing="back">
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraHint}>Point at receipt</Text>
            <View style={styles.cameraActions}>
              <TouchableOpacity style={styles.cancelCameraBtn} onPress={() => setShowCamera(false)}>
                <Text style={styles.cancelCameraText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.captureBtn} onPress={captureAndOcr} disabled={scanning}>
                {scanning ? <ActivityIndicator color={Colors.textInverse} /> : <Text style={styles.captureIcon}>📸</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Log Expense</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={styles.ocrBtn}
            onPress={async () => {
              if (!permission?.granted) await requestPermission();
              setShowCamera(true);
            }}
          >
            <Text style={styles.ocrBtnEmoji}>📷</Text>
            <Text style={styles.ocrBtnText}>Scan Receipt (auto-fill)</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Account</Text>
          <View style={styles.accountGrid}>
            {accounts.slice(0, 8).map((acc) => (
              <TouchableOpacity
                key={acc.id}
                style={[styles.accountChip, selectedAccount?.id === acc.id && styles.accountChipActive]}
                onPress={() => setSelectedAccount(acc)}
              >
                <Text style={[styles.accountText, selectedAccount?.id === acc.id && styles.accountTextActive]}>
                  {acc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={Colors.textDisabled}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Vendor</Text>
          <TextInput
            style={styles.input}
            value={vendor}
            onChangeText={setVendor}
            placeholder="Vendor name"
            placeholderTextColor={Colors.textDisabled}
          />

          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textDisabled}
          />

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add a note..."
            placeholderTextColor={Colors.textDisabled}
            multiline
            numberOfLines={3}
          />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.textInverse} />
            ) : (
              <Text style={styles.submitText}>Save Expense</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  },
  back: { fontSize: FontSize.lg, color: Colors.primary, fontWeight: '600', width: 60 },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  scroll: { padding: Spacing.md, gap: Spacing.sm },
  ocrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary + '15',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    marginBottom: Spacing.md,
  },
  ocrBtnEmoji: { fontSize: 20 },
  ocrBtnText: { fontSize: FontSize.base, color: Colors.primary, fontWeight: '700' },
  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4, marginTop: Spacing.sm },
  accountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  accountChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  accountChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  accountText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  accountTextActive: { color: Colors.textInverse, fontWeight: '600' },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  notesInput: { height: 90, paddingTop: Spacing.sm, textAlignVertical: 'top' },
  footer: { padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  submitBtn: { height: 56, backgroundColor: Colors.primary, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
  cameraOverlay: { flex: 1, justifyContent: 'flex-end', padding: Spacing.xl },
  cameraHint: { color: Colors.textInverse, textAlign: 'center', fontSize: FontSize.base, marginBottom: Spacing.xl, fontWeight: '600' },
  cameraActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cancelCameraBtn: { padding: Spacing.md },
  cancelCameraText: { color: Colors.textInverse, fontSize: FontSize.base, fontWeight: '600' },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  captureIcon: { fontSize: 32 },
});

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiClient } from '../../../lib/api/client';
import { NumberPadSheet } from '../../../components/shared/NumberPad';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';
import { format } from 'date-fns';

interface PO {
  id: string;
  supplier_name: string;
  expected_delivery_date: string;
  status: string;
  line_items: POLineItem[];
}

interface POLineItem {
  id: string;
  item_id: string;
  item_name: string;
  ordered_quantity: number;
  unit: string;
  unit_price: number;
}

interface ReceiveLine {
  item_id: string;
  item_name: string;
  ordered_qty: number;
  received_qty: number;
  actual_unit_price: number;
  unit: string;
  condition: 'good' | 'damaged' | 'rejected';
}

export default function ReceiveScreen() {
  const router = useRouter();
  const [pos, setPOs] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [padField, setPadField] = useState<'qty' | 'price'>('qty');
  const [showPad, setShowPad] = useState(false);
  const [invoicePhotoUri, setInvoicePhotoUri] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraRef, setCameraRef] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    apiClient.get('/api/inventory/purchase-orders?status=sent&page_size=20')
      .then(({ data }) => { setPOs(data.items ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const selectPO = (po: PO) => {
    setSelectedPO(po);
    setLines(po.line_items.map((li) => ({
      item_id: li.item_id,
      item_name: li.item_name,
      ordered_qty: li.ordered_quantity,
      received_qty: li.ordered_quantity,
      actual_unit_price: li.unit_price,
      unit: li.unit,
      condition: 'good',
    })));
  };

  const openAdHoc = () => {
    setSelectedPO(null);
    setLines([{ item_id: '', item_name: '', ordered_qty: 0, received_qty: 0, actual_unit_price: 0, unit: 'unit', condition: 'good' }]);
  };

  const openPad = (idx: number, field: 'qty' | 'price') => {
    setActiveLine(idx);
    setPadField(field);
    setShowPad(true);
  };

  const applyPad = (val: number) => {
    if (activeLine === null) return;
    setLines((prev) => prev.map((l, i) => {
      if (i !== activeLine) return l;
      return padField === 'qty' ? { ...l, received_qty: val } : { ...l, actual_unit_price: val };
    }));
    setShowPad(false);
  };

  const captureInvoice = async () => {
    if (!cameraRef) return;
    const photo = await cameraRef.takePictureAsync({ quality: 0.7 });
    setInvoicePhotoUri(photo.uri);
    setShowCamera(false);
  };

  const submit = async () => {
    if (lines.length === 0) return;
    setSubmitting(true);
    try {
      let invoiceFileUrl: string | undefined;

      if (invoicePhotoUri) {
        const form = new FormData();
        form.append('image', { uri: invoicePhotoUri, type: 'image/jpeg', name: 'invoice.jpg' } as any);
        form.append('purpose', 'invoice');
        const { data: fd } = await apiClient.post('/api/files/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        invoiceFileUrl = fd.data?.publicUrl;
      }

      const payload: any = {
        purchase_order_id: selectedPO?.id,
        invoice_photo_url: invoiceFileUrl,
        line_items: lines.map((l) => ({
          inventory_item_id: l.item_id || undefined,
          received_quantity: l.received_qty,
          actual_unit_price: l.actual_unit_price,
          condition: l.condition,
          unit: l.unit,
        })),
      };

      const { data: receipt } = await apiClient.post('/api/inventory/receipts', payload);
      await apiClient.post(`/api/inventory/receipts/${receipt.id}/confirm`, {});

      Alert.alert('Confirmed', 'Delivery received and stock updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to confirm receipt.');
    } finally {
      setSubmitting(false);
    }
  };

  if (showCamera) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView style={{ flex: 1 }} ref={setCameraRef} facing="back">
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraHint}>Photograph the invoice / delivery note</Text>
            <TouchableOpacity style={styles.captureBtn} onPress={captureInvoice}>
              <Text style={styles.captureIcon}>📸</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCamera(false)}>
              <Text style={styles.cancelCamera}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  if (lines.length > 0) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setLines([])}>
            <Text style={styles.back}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {selectedPO ? selectedPO.supplier_name : 'Ad-hoc Receipt'}
          </Text>
          <TouchableOpacity onPress={async () => {
            if (!permission?.granted) await requestPermission();
            setShowCamera(true);
          }}>
            <Text style={styles.photoBtn}>{invoicePhotoUri ? '📷✓' : '📷'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {lines.map((line, idx) => (
            <View key={idx} style={styles.lineCard}>
              <Text style={styles.lineName}>{line.item_name || 'Unknown item'}</Text>
              <Text style={styles.lineOrdered}>Ordered: {line.ordered_qty} {line.unit}</Text>

              <View style={styles.lineInputRow}>
                <View style={styles.lineField}>
                  <Text style={styles.lineFieldLabel}>Received Qty</Text>
                  <TouchableOpacity style={styles.lineInput} onPress={() => openPad(idx, 'qty')}>
                    <Text style={styles.lineInputText}>{line.received_qty} {line.unit}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.lineField}>
                  <Text style={styles.lineFieldLabel}>Unit Price</Text>
                  <TouchableOpacity style={styles.lineInput} onPress={() => openPad(idx, 'price')}>
                    <Text style={styles.lineInputText}>${line.actual_unit_price.toFixed(2)}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.conditionRow}>
                {(['good', 'damaged', 'rejected'] as const).map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.conditionChip, line.condition === c && styles.conditionChipActive(c)]}
                    onPress={() => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, condition: c } : l))}
                  >
                    <Text style={[styles.conditionText, line.condition === c && styles.conditionTextActive]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmBtn, submitting && styles.disabled]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.textInverse} />
            ) : (
              <Text style={styles.confirmBtnText}>Confirm Receipt</Text>
            )}
          </TouchableOpacity>
        </View>

        <NumberPadSheet
          visible={showPad}
          label={padField === 'qty' ? 'Received quantity' : 'Actual unit price'}
          unit={padField === 'qty' && activeLine !== null ? lines[activeLine]?.unit : undefined}
          initialValue={activeLine !== null ? (padField === 'qty' ? lines[activeLine]?.received_qty : lines[activeLine]?.actual_unit_price) : 0}
          onConfirm={applyPad}
          onCancel={() => setShowPad(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Receive Delivery</Text>
        <View style={{ width: 60 }} />
      </View>

      <TouchableOpacity style={styles.adHocBtn} onPress={openAdHoc}>
        <Text style={styles.adHocText}>+ Ad-hoc receipt (no PO)</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <FlatList
          data={pos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No open purchase orders</Text>
            </View>
          }
          renderItem={({ item: po }) => (
            <TouchableOpacity style={styles.poCard} onPress={() => selectPO(po)}>
              <Text style={styles.poSupplier}>{po.supplier_name}</Text>
              <Text style={styles.poDate}>
                Expected {format(new Date(po.expected_delivery_date), 'MMM d')}
              </Text>
              <Text style={styles.poItems}>{po.line_items.length} items</Text>
            </TouchableOpacity>
          )}
        />
      )}
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  back: { fontSize: FontSize.lg, color: Colors.primary, fontWeight: '600', width: 60 },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  photoBtn: { fontSize: FontSize.xl, width: 60, textAlign: 'right' },
  adHocBtn: {
    margin: Spacing.md,
    backgroundColor: Colors.primary + '15',
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  adHocText: { fontSize: FontSize.base, color: Colors.primary, fontWeight: '700' },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
  empty: { paddingTop: 40, alignItems: 'center' },
  emptyText: { color: Colors.textSecondary },
  poCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  poSupplier: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  poDate: { fontSize: FontSize.sm, color: Colors.textSecondary },
  poItems: { fontSize: FontSize.xs, color: Colors.textDisabled },
  scroll: { padding: Spacing.md, gap: Spacing.md },
  lineCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  lineName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  lineOrdered: { fontSize: FontSize.xs, color: Colors.textSecondary },
  lineInputRow: { flexDirection: 'row', gap: Spacing.md },
  lineField: { flex: 1, gap: 4 },
  lineFieldLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  lineInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  lineInputText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  conditionRow: { flexDirection: 'row', gap: Spacing.sm },
  conditionChip: (condition?: string) => ({
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  }),
  conditionChipActive: (condition: string) => ({
    backgroundColor: condition === 'good' ? Colors.success : condition === 'damaged' ? Colors.warning : Colors.danger,
    borderColor: 'transparent',
  }),
  conditionText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', textTransform: 'capitalize' },
  conditionTextActive: { color: Colors.textInverse },
  footer: { padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  confirmBtn: {
    height: 56,
    backgroundColor: Colors.success,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: { fontSize: FontSize.base, color: Colors.textInverse, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  cameraOverlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', padding: Spacing.xl, gap: Spacing.lg },
  cameraHint: { color: Colors.textInverse, textAlign: 'center', fontSize: FontSize.base, fontWeight: '600' },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  captureIcon: { fontSize: 32 },
  cancelCamera: { color: Colors.textInverse, fontWeight: '600', fontSize: FontSize.base },
} as any);

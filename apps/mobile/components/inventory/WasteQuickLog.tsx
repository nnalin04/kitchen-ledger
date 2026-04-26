import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { database } from '../../lib/watermelon/database';
import { InventoryItem, WasteLogPending } from '../../lib/watermelon/models';
import { apiClient } from '../../lib/api/client';
import { NumberPadSheet } from '../shared/NumberPad';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';
import NetInfo from '@react-native-community/netinfo';

const REASONS = ['Spoilage', 'Prep Waste', 'Overproduction', 'Cooking Error', 'Contamination'] as const;
type Reason = (typeof REASONS)[number];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function WasteQuickLog({ visible, onClose, onSuccess }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [reason, setReason] = useState<Reason | null>(null);
  const [quantity, setQuantity] = useState(0);
  const [station, setStation] = useState('');
  const [showPad, setShowPad] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const searchItems = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 1) { setSearchResults([]); return; }

    const items = await database
      .get<InventoryItem>('inventory_items')
      .query()
      .fetch();

    setSearchResults(
      items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    );
  };

  const reset = () => {
    setSearchQuery('');
    setSelectedItem(null);
    setSearchResults([]);
    setReason(null);
    setQuantity(0);
    setStation('');
  };

  const handleClose = () => { reset(); onClose(); };

  const submit = async () => {
    if (!selectedItem || !reason || quantity <= 0) {
      Alert.alert('Missing info', 'Select an item, reason, and quantity.');
      return;
    }

    setSubmitting(true);
    const net = await NetInfo.fetch();

    try {
      if (net.isConnected) {
        await apiClient.post('/api/inventory/waste', {
          inventory_item_id: selectedItem.serverId,
          quantity,
          unit: selectedItem.countUnit,
          reason,
          station: station || undefined,
        });
      } else {
        await database.write(async () => {
          await database.get<WasteLogPending>('waste_logs_pending').create((log) => {
            log.inventoryItemId = selectedItem.serverId;
            log.quantity = quantity;
            log.unit = selectedItem.countUnit;
            log.reason = reason;
            log.station = station;
            log.loggedAt = Date.now();
            log.synced = false;
          });

          await selectedItem.update((i) => {
            i.currentStock = Math.max(0, i.currentStock - quantity);
          });
        });
      }

      reset();
      onSuccess();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to log waste.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <View style={styles.root}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Log Waste</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Step 1: Item search */}
            <Text style={styles.stepLabel}>Item</Text>
            {selectedItem ? (
              <TouchableOpacity style={styles.selectedItem} onPress={() => setSelectedItem(null)}>
                <Text style={styles.selectedItemName}>{selectedItem.name}</Text>
                <Text style={styles.selectedItemSub}>
                  {selectedItem.currentStock} {selectedItem.countUnit} in stock · tap to change
                </Text>
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  style={styles.search}
                  value={searchQuery}
                  onChangeText={searchItems}
                  placeholder="Search ingredient..."
                  placeholderTextColor={Colors.textDisabled}
                  autoFocus
                />
                {searchResults.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.resultRow}
                    onPress={() => { setSelectedItem(item); setSearchResults([]); }}
                  >
                    <Text style={styles.resultName}>{item.name}</Text>
                    <Text style={styles.resultStock}>
                      {item.currentStock} {item.countUnit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Step 2: Reason chips */}
            <Text style={styles.stepLabel}>Reason</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reasonScroll}>
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reasonChip, reason === r && styles.reasonChipActive]}
                  onPress={() => setReason(r)}
                >
                  <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Step 3: Quantity */}
            <Text style={styles.stepLabel}>Quantity</Text>
            <TouchableOpacity style={styles.qtyButton} onPress={() => setShowPad(true)}>
              <Text style={styles.qtyValue}>
                {quantity > 0 ? `${quantity} ${selectedItem?.countUnit ?? ''}` : 'Tap to enter'}
              </Text>
            </TouchableOpacity>

            {/* Step 4: Station (optional) */}
            <Text style={styles.stepLabel}>Station (optional)</Text>
            <TextInput
              style={styles.stationInput}
              value={station}
              onChangeText={setStation}
              placeholder="e.g. Grill, Prep, Bar"
              placeholderTextColor={Colors.textDisabled}
            />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.logBtn, (!selectedItem || !reason || quantity <= 0) && styles.logBtnDisabled]}
              onPress={submit}
              disabled={submitting || !selectedItem || !reason || quantity <= 0}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.logBtnText}>Log Waste</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <NumberPadSheet
        visible={showPad}
        label="Enter quantity"
        unit={selectedItem?.countUnit}
        initialValue={quantity}
        onConfirm={(v) => { setQuantity(v); setShowPad(false); }}
        onCancel={() => setShowPad(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  close: { fontSize: FontSize.xl, color: Colors.textSecondary },
  scroll: { padding: Spacing.lg, gap: Spacing.sm },
  stepLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  search: {
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultName: { fontSize: FontSize.base, color: Colors.textPrimary, fontWeight: '500' },
  resultStock: { fontSize: FontSize.sm, color: Colors.textSecondary },
  selectedItem: {
    padding: Spacing.md,
    backgroundColor: Colors.primaryLight + '15',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  selectedItemName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.primary },
  selectedItemSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  reasonScroll: { marginHorizontal: -Spacing.xs },
  reasonChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginRight: Spacing.sm,
  },
  reasonChipActive: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  reasonText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  reasonTextActive: { color: Colors.textInverse },
  qtyButton: {
    height: 56,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  qtyValue: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary },
  stationInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  footer: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  logBtn: {
    height: 56,
    backgroundColor: Colors.danger,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnDisabled: { opacity: 0.5 },
  logBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
});

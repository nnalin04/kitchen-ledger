import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SectionList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withObservables } from '@nozbe/watermelondb/react';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../../lib/watermelon/database';
import { CountSessionItem } from '../../../lib/watermelon/models';
import { apiClient } from '../../../lib/api/client';
import { NumberPadSheet } from '../../../components/shared/NumberPad';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';

const LOCATIONS = ['Walk-In', 'Dry Storage', 'Freezer', 'Bar', 'Other'];

interface Props {
  sessionItems: CountSessionItem[];
}

function CountSessionInner({ sessionItems }: Props) {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(LOCATIONS[0]);
  const [selectedItem, setSelectedItem] = useState<CountSessionItem | null>(null);
  const [showPad, setShowPad] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [itemMeta, setItemMeta] = useState<Record<string, { name: string; unit: string; location: string; expectedQty: number }>>({});

  useEffect(() => {
    loadItemMeta();
  }, [sessionId]);

  const loadItemMeta = async () => {
    try {
      const { data } = await apiClient.get(`/api/inventory/counts/${sessionId}/items`);
      const meta: typeof itemMeta = {};
      for (const item of data.items ?? []) {
        meta[item.id] = {
          name: item.item_name,
          unit: item.unit,
          location: item.storage_location,
          expectedQty: item.expected_quantity,
        };
      }
      setItemMeta(meta);
    } catch {}
  };

  const countedTotal = sessionItems.filter((i) => i.countedQuantity > 0).length;
  const total = sessionItems.length;

  const handleCount = async (item: CountSessionItem, qty: number) => {
    await database.write(async () => {
      await item.update((i) => {
        i.countedQuantity = qty;
        i.synced = false;
      });
    });

    try {
      await apiClient.patch(
        `/api/inventory/counts/${sessionId}/items/${item.serverCountItemId}`,
        { counted_quantity: qty }
      );
      await database.write(async () => { await item.update((i) => { i.synced = true; }); });
    } catch {}
  };

  const completeCount = async () => {
    if (countedTotal < total) {
      Alert.alert(
        'Incomplete count',
        `${total - countedTotal} items not yet counted. Complete anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Complete', style: 'destructive', onPress: doComplete },
        ]
      );
    } else {
      doComplete();
    }
  };

  const doComplete = async () => {
    setCompleting(true);
    try {
      await apiClient.post(`/api/inventory/counts/${sessionId}/complete`);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', 'Could not complete count. Check connectivity.');
    } finally {
      setCompleting(false);
    }
  };

  const tabItems = sessionItems.filter(
    (item) => (itemMeta[item.serverCountItemId]?.location ?? 'Other') === activeTab
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.progress}>
          {countedTotal} / {total} counted
        </Text>
        <TouchableOpacity
          style={[styles.completeBtn, completing && styles.completeBtnDisabled]}
          onPress={completeCount}
          disabled={completing}
        >
          {completing ? (
            <ActivityIndicator color={Colors.textInverse} size="small" />
          ) : (
            <Text style={styles.completeBtnText}>Complete</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${total > 0 ? (countedTotal / total) * 100 : 0}%` as any }]} />
      </View>

      <View style={styles.tabs}>
        {LOCATIONS.map((loc) => (
          <TouchableOpacity
            key={loc}
            style={[styles.tab, activeTab === loc && styles.tabActive]}
            onPress={() => setActiveTab(loc)}
          >
            <Text style={[styles.tabText, activeTab === loc && styles.tabTextActive]}>
              {loc}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={tabItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const meta = itemMeta[item.serverCountItemId];
          const counted = item.countedQuantity > 0;

          return (
            <TouchableOpacity
              style={[styles.itemRow, counted && styles.itemRowCounted]}
              onPress={() => { setSelectedItem(item); setShowPad(true); }}
              activeOpacity={0.75}
            >
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{meta?.name ?? '...'}</Text>
                {meta?.expectedQty != null && (
                  <Text style={styles.expectedText}>Expected: {meta.expectedQty} {meta?.unit}</Text>
                )}
              </View>
              <View style={styles.countDisplay}>
                {counted ? (
                  <>
                    <Text style={styles.countValue}>{item.countedQuantity}</Text>
                    <Text style={styles.countUnit}>{meta?.unit ?? ''}</Text>
                  </>
                ) : (
                  <Text style={styles.countPlaceholder}>Tap to count</Text>
                )}
                {item.synced && <Text style={styles.syncIcon}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {selectedItem && (
        <NumberPadSheet
          visible={showPad}
          label={`Count: ${itemMeta[selectedItem.serverCountItemId]?.name ?? ''}`}
          unit={itemMeta[selectedItem.serverCountItemId]?.unit}
          initialValue={selectedItem.countedQuantity}
          onConfirm={(qty) => { handleCount(selectedItem, qty); setShowPad(false); }}
          onCancel={() => setShowPad(false)}
        />
      )}
    </SafeAreaView>
  );
}

const enhance = withObservables(
  ['sessionId'],
  ({ sessionId }: { sessionId: string }) => ({
    sessionItems: database
      .get<CountSessionItem>('count_session_items')
      .query(Q.where('count_session_id', sessionId)),
  })
);

export default function CountSessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const Enhanced = enhance(CountSessionInner);
  return <Enhanced sessionId={sessionId} />;
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
  back: { fontSize: FontSize.lg, color: Colors.primary, fontWeight: '600' },
  progress: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  completeBtn: {
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    minWidth: 90,
    alignItems: 'center',
  },
  completeBtnDisabled: { opacity: 0.6 },
  completeBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  progressBar: { height: 4, backgroundColor: Colors.border, marginHorizontal: Spacing.md },
  progressFill: { height: 4, backgroundColor: Colors.primary },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  tab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: Colors.textInverse },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
  itemRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  itemRowCounted: { borderColor: Colors.success + '60', backgroundColor: '#f0fdf4' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  expectedText: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  countDisplay: { alignItems: 'flex-end', gap: 2 },
  countValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  countUnit: { fontSize: FontSize.xs, color: Colors.textSecondary },
  countPlaceholder: { fontSize: FontSize.sm, color: Colors.textDisabled, fontStyle: 'italic' },
  syncIcon: { fontSize: FontSize.xs, color: Colors.success },
});

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SectionList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '../../../lib/watermelon/database';
import { InventoryItem } from '../../../lib/watermelon/models';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';

const ABC_COLORS = { A: Colors.danger, B: Colors.warning, C: Colors.textSecondary };
const FILTER_OPTIONS = ['All', 'A', 'B', 'C', 'Low Stock'] as const;

function groupByLocation(items: InventoryItem[]) {
  const map = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const loc = item.storageLocation || 'Other';
    if (!map.has(loc)) map.set(loc, []);
    map.get(loc)!.push(item);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

function InventoryListInner({ items }: { items: InventoryItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTER_OPTIONS)[number]>('All');

  const filtered = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === 'All' ||
      (filter === 'Low Stock' ? item.isLowStock : item.abcCategory === filter);
    return matchesSearch && matchesFilter;
  });

  const sections = groupByLocation(filtered);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => router.push('/(tabs)/inventory/scan')}
        >
          <Text style={styles.scanIcon}>📷</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search items..."
        placeholderTextColor={Colors.textDisabled}
        clearButtonMode="while-editing"
      />

      <View style={styles.filters}>
        {FILTER_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, filter === opt && styles.chipActive]}
            onPress={() => setFilter(opt)}
          >
            <Text style={[styles.chipText, filter === opt && styles.chipTextActive]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length} items</Text>
          </View>
        )}
        renderItem={({ item }) => <ItemRow item={item} />}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled
      />
    </SafeAreaView>
  );
}

function ItemRow({ item }: { item: InventoryItem }) {
  const pct = item.parLevel > 0 ? Math.min(item.currentStock / item.parLevel, 1) : 1;
  const isLow = item.isLowStock;

  return (
    <View style={[styles.row, isLow && styles.rowLow]}>
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.abcBadge, { backgroundColor: ABC_COLORS[item.abcCategory as keyof typeof ABC_COLORS] + '20' }]}>
            <Text style={[styles.abcText, { color: ABC_COLORS[item.abcCategory as keyof typeof ABC_COLORS] }]}>
              {item.abcCategory}
            </Text>
          </View>
        </View>
        <View style={styles.stockRow}>
          <Text style={[styles.stockText, isLow && styles.stockLow]}>
            {item.currentStock} {item.countUnit}
          </Text>
          <Text style={styles.parText}>PAR: {item.parLevel}</Text>
        </View>
        <View style={styles.progressBg}>
          <View
            style={[
              styles.progressFill,
              { width: `${pct * 100}%` as any },
              isLow && { backgroundColor: Colors.danger },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const enhance = withObservables([], () => ({
  items: database.get<InventoryItem>('inventory_items').query(),
}));

export default enhance(InventoryListInner);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
  scanBtn: { padding: Spacing.sm },
  scanIcon: { fontSize: 22 },
  search: {
    margin: Spacing.md,
    marginTop: 0,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: Colors.textInverse },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  sectionCount: { fontSize: FontSize.xs, color: Colors.textSecondary },
  row: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowLow: { borderColor: Colors.danger + '60', backgroundColor: '#fff5f5' },
  rowMain: { gap: Spacing.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemName: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  abcBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm },
  abcText: { fontSize: FontSize.xs, fontWeight: '700' },
  stockRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  stockText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  stockLow: { color: Colors.danger, fontWeight: '700' },
  parText: { fontSize: FontSize.xs, color: Colors.textDisabled },
  progressBg: { height: 4, backgroundColor: Colors.border, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: Colors.success, borderRadius: 2 },
});

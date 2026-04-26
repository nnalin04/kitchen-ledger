import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';

interface Shift {
  id: string;
  start_time: string;
  end_time: string;
  role: string;
  station?: string;
  status: string;
}

const DAYS_OF_WEEK = 7;

export default function ScheduleScreen() {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(new Date());
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  useEffect(() => {
    apiClient.get('/api/staff/shifts/my').then(({ data }) => {
      setShifts(data.items ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const dayShifts = shifts.filter((s) => isSameDay(new Date(s.start_time), selectedDay));

  const requestSwap = async (shiftId: string) => {
    Alert.alert('Request Swap', 'Submit a swap request for this shift?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Request',
        onPress: async () => {
          try {
            await apiClient.post(`/api/staff/shifts/${shiftId}/swap-request`);
            Alert.alert('Submitted', 'Swap request sent to manager.');
          } catch {
            Alert.alert('Error', 'Could not submit swap request.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Schedule</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.weekStrip}>
        {Array.from({ length: DAYS_OF_WEEK }).map((_, i) => {
          const day = addDays(weekStart, i);
          const isSelected = isSameDay(day, selectedDay);
          const hasShift = shifts.some((s) => isSameDay(new Date(s.start_time), day));
          return (
            <TouchableOpacity
              key={i}
              style={[styles.dayCell, isSelected && styles.dayCellActive]}
              onPress={() => setSelectedDay(day)}
            >
              <Text style={[styles.dayName, isSelected && styles.dayNameActive]}>
                {format(day, 'EEE')}
              </Text>
              <Text style={[styles.dayNum, isSelected && styles.dayNumActive]}>
                {format(day, 'd')}
              </Text>
              {hasShift && <View style={[styles.dot, isSelected && styles.dotActive]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} />
      ) : (
        <FlatList
          data={dayShifts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No shifts on {format(selectedDay, 'EEEE')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.shiftCard}>
              <View style={styles.shiftInfo}>
                <Text style={styles.shiftRole}>{item.role}</Text>
                <Text style={styles.shiftTime}>
                  {format(new Date(item.start_time), 'h:mm a')} – {format(new Date(item.end_time), 'h:mm a')}
                </Text>
                {item.station && <Text style={styles.shiftStation}>{item.station}</Text>}
              </View>
              {new Date(item.start_time) > new Date() && (
                <TouchableOpacity style={styles.swapBtn} onPress={() => requestSwap(item.id)}>
                  <Text style={styles.swapBtnText}>Swap</Text>
                </TouchableOpacity>
              )}
            </View>
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  back: { fontSize: FontSize.lg, color: Colors.primary, fontWeight: '600', width: 60 },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  dayCell: { alignItems: 'center', padding: Spacing.sm, borderRadius: Radius.md, minWidth: 44 },
  dayCellActive: { backgroundColor: Colors.primary },
  dayName: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  dayNameActive: { color: Colors.textInverse },
  dayNum: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  dayNumActive: { color: Colors.textInverse },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.primary, marginTop: 2 },
  dotActive: { backgroundColor: Colors.textInverse },
  list: { padding: Spacing.md, gap: Spacing.md },
  empty: { paddingTop: Spacing.xxl, alignItems: 'center' },
  emptyText: { fontSize: FontSize.base, color: Colors.textSecondary },
  shiftCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  shiftInfo: { flex: 1, gap: 2 },
  shiftRole: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  shiftTime: { fontSize: FontSize.sm, color: Colors.textSecondary },
  shiftStation: { fontSize: FontSize.xs, color: Colors.textDisabled },
  swapBtn: { backgroundColor: Colors.surfaceElevated, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  swapBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
});

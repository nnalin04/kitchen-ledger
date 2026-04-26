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
import { format } from 'date-fns';

interface TodayShift {
  id: string;
  role: string;
  start_time: string;
  end_time: string;
  station: string;
  is_clocked_in: boolean;
  clock_in_time?: string;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  due_time?: string;
  completed: boolean;
}

export default function StaffIndexScreen() {
  const router = useRouter();
  const [shift, setShift] = useState<TodayShift | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [shiftRes, tasksRes] = await Promise.all([
        apiClient.get('/api/staff/shifts/today'),
        apiClient.get('/api/staff/tasks?assigned_to_me=true&status=pending'),
      ]);
      setShift(shiftRes.data);
      setTasks(tasksRes.data.items ?? []);
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
        <Text style={styles.title}>My Shift</Text>

        {shift ? (
          <View style={styles.shiftCard}>
            <View style={styles.shiftInfo}>
              <Text style={styles.shiftRole}>{shift.role}</Text>
              <Text style={styles.shiftTime}>
                {format(new Date(shift.start_time), 'h:mm a')} –{' '}
                {format(new Date(shift.end_time), 'h:mm a')}
              </Text>
              {shift.station && <Text style={styles.shiftStation}>{shift.station}</Text>}
            </View>
            <TouchableOpacity
              style={[styles.clockBtn, shift.is_clocked_in && styles.clockBtnOut]}
              onPress={() => router.push('/(tabs)/staff/clock')}
            >
              <Text style={styles.clockBtnText}>
                {shift.is_clocked_in ? 'Clock Out' : 'Clock In'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noShift}>
            <Text style={styles.noShiftText}>No shift scheduled today</Text>
          </View>
        )}

        <TouchableOpacity style={styles.scheduleLink} onPress={() => router.push('/(tabs)/staff/schedule')}>
          <Text style={styles.scheduleLinkText}>View schedule →</Text>
        </TouchableOpacity>

        {tasks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>My Tasks Today</Text>
            {tasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                style={styles.taskRow}
                onPress={() => router.push('/(tabs)/staff/tasks')}
              >
                <View style={[styles.priorityDot, styles[`priority_${task.priority}`]]} />
                <Text style={styles.taskTitle}>{task.title}</Text>
                {task.due_time && (
                  <Text style={styles.taskTime}>
                    {format(new Date(task.due_time), 'h:mm a')}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.md, gap: Spacing.md },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
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
  shiftRole: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  shiftTime: { fontSize: FontSize.sm, color: Colors.textSecondary },
  shiftStation: { fontSize: FontSize.xs, color: Colors.textDisabled },
  clockBtn: {
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  clockBtnOut: { backgroundColor: Colors.danger },
  clockBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  noShift: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noShiftText: { fontSize: FontSize.base, color: Colors.textSecondary },
  scheduleLink: { alignSelf: 'flex-start' },
  scheduleLinkText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.sm },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  priority_high: { backgroundColor: Colors.danger },
  priority_medium: { backgroundColor: Colors.warning },
  priority_low: { backgroundColor: Colors.success },
  taskTitle: { flex: 1, fontSize: FontSize.base, color: Colors.textPrimary, fontWeight: '500' },
  taskTime: { fontSize: FontSize.xs, color: Colors.textSecondary },
} as any);

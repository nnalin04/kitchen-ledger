import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';

// ─── Types ──────────────────────────────────────────────────────────────────

type Shift = 'opening' | 'closing';

interface Task {
  id: string;
  title: string;
  shift: Shift;
  requires_photo: boolean;
  status: 'pending' | 'completed';
  completed_at?: string;
  photo_url?: string;
  order?: number;
}

interface SectionData {
  title: string;
  shift: Shift;
  data: Task[];
}

// ─── Animated task row ───────────────────────────────────────────────────────

interface TaskRowProps {
  item: Task;
  index: number;
  onToggle: (task: Task) => void;
  onPhotoPress: (task: Task) => void;
  completing: boolean;
}

function TaskRow({ item, index, onToggle, onPhotoPress, completing }: TaskRowProps) {
  const scale = useSharedValue(1);
  const checkScale = useSharedValue(item.status === 'completed' ? 1 : 0);

  const handlePress = () => {
    if (item.status === 'completed') return;
    // Bounce the row
    scale.value = withSequence(
      withTiming(0.97, { duration: 80 }),
      withSpring(1, { damping: 10, stiffness: 200 })
    );
    // Pop the checkmark in
    checkScale.value = withSpring(1, { damping: 12, stiffness: 300 });
    onToggle(item);
  };

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  const isDone = item.status === 'completed';

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 55).duration(280).springify()}
      style={rowStyle}
    >
      <TouchableOpacity
        style={[styles.taskRow, isDone && styles.taskRowDone]}
        onPress={handlePress}
        disabled={completing || isDone}
        activeOpacity={0.8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={item.title}
      >
        {/* Checkbox */}
        <View style={[styles.checkbox, isDone && styles.checkboxDone]}>
          {completing ? (
            <ActivityIndicator size="small" color={Colors.textInverse} />
          ) : (
            <Animated.Text style={[styles.checkmark, checkStyle]}>✓</Animated.Text>
          )}
        </View>

        {/* Task title */}
        <View style={styles.taskContent}>
          <Text
            style={[styles.taskTitle, isDone && styles.taskTitleDone]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          {item.completed_at && (
            <Text style={styles.completedTime}>
              Done at {new Date(item.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>

        {/* Photo icon */}
        {item.requires_photo && (
          <TouchableOpacity
            style={[styles.photoBtn, isDone && styles.photoBtnDone]}
            onPress={() => onPhotoPress(item)}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            accessibilityLabel="Attach photo"
          >
            {item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={styles.photoThumb} />
            ) : (
              <Text style={styles.photoIcon}>📷</Text>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  shift: Shift;
  pendingCount: number;
  onCompleteAll: (shift: Shift) => void;
  bulkCompleting: boolean;
}

function SectionHeader({ title, shift, pendingCount, onCompleteAll, bulkCompleting }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionEmoji}>{shift === 'opening' ? '🌅' : '🌙'}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        {pendingCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingCount}</Text>
          </View>
        )}
      </View>
      {pendingCount > 0 && (
        <TouchableOpacity
          style={[styles.bulkBtn, bulkCompleting && styles.disabled]}
          onPress={() => onCompleteAll(shift)}
          disabled={bulkCompleting}
          accessibilityRole="button"
          accessibilityLabel={`Complete all ${shift} tasks`}
        >
          {bulkCompleting ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.bulkBtnText}>Complete All</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function TasksScreen() {
  const router = useRouter();
  const [openingTasks, setOpeningTasks] = useState<Task[]>([]);
  const [closingTasks, setClosingTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completing, setCompleting] = useState<Record<string, boolean>>({});
  const [bulkCompleting, setBulkCompleting] = useState<Record<Shift, boolean>>({
    opening: false,
    closing: false,
  });

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadTasks = useCallback(async () => {
    try {
      const [openRes, closeRes] = await Promise.all([
        apiClient.get<{ items: Task[] }>('/api/staff/tasks?shift=opening'),
        apiClient.get<{ items: Task[] }>('/api/staff/tasks?shift=closing'),
      ]);
      setOpeningTasks(openRes.data.items ?? []);
      setClosingTasks(closeRes.data.items ?? []);
    } catch {
      // Silently retain stale data if offline
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  }, [loadTasks]);

  useEffect(() => {
    loadTasks().finally(() => setLoading(false));
  }, [loadTasks]);

  // ── Photo upload ──────────────────────────────────────────────────────────

  const pickAndUploadPhoto = async (): Promise<string | undefined> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo access to attach a photo to this task.');
      return undefined;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return undefined;

    const asset = result.assets[0];
    const form = new FormData();
    form.append('image', {
      uri: asset.uri,
      type: asset.mimeType ?? 'image/jpeg',
      name: 'task-photo.jpg',
    } as any);
    form.append('purpose', 'task_completion');

    try {
      const { data } = await apiClient.post('/api/files/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data?.publicUrl as string | undefined;
    } catch {
      Alert.alert('Upload failed', 'Could not upload photo. Try again.');
      return undefined;
    }
  };

  // ── Complete single task ──────────────────────────────────────────────────

  const completeTask = useCallback(async (task: Task, photoUrl?: string) => {
    setCompleting((prev) => ({ ...prev, [task.id]: true }));
    try {
      await apiClient.post(`/api/staff/tasks/${task.id}/complete`, {
        photo_url: photoUrl,
      });
      // Optimistic update
      const updater = (tasks: Task[]) =>
        tasks.map((t) =>
          t.id === task.id
            ? { ...t, status: 'completed' as const, completed_at: new Date().toISOString(), photo_url: photoUrl }
            : t
        );
      if (task.shift === 'opening') setOpeningTasks(updater);
      else setClosingTasks(updater);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Could not complete task.');
    } finally {
      setCompleting((prev) => ({ ...prev, [task.id]: false }));
    }
  }, []);

  const handleToggle = useCallback(async (task: Task) => {
    if (task.requires_photo) {
      const url = await pickAndUploadPhoto();
      await completeTask(task, url);
    } else {
      await completeTask(task);
    }
  }, [completeTask]);

  const handlePhotoPress = useCallback(async (task: Task) => {
    const url = await pickAndUploadPhoto();
    if (url) {
      if (task.status === 'pending') {
        await completeTask(task, url);
      } else {
        // Update photo on already-completed task
        try {
          await apiClient.patch(`/api/staff/tasks/${task.id}`, { photo_url: url });
          const updater = (tasks: Task[]) =>
            tasks.map((t) => (t.id === task.id ? { ...t, photo_url: url } : t));
          if (task.shift === 'opening') setOpeningTasks(updater);
          else setClosingTasks(updater);
        } catch {
          Alert.alert('Error', 'Could not update photo.');
        }
      }
    }
  }, [completeTask]);

  // ── Bulk complete ─────────────────────────────────────────────────────────

  const completeAll = useCallback(async (shift: Shift) => {
    const tasks = shift === 'opening' ? openingTasks : closingTasks;
    const pending = tasks.filter((t) => t.status === 'pending');
    if (pending.length === 0) return;

    setBulkCompleting((prev) => ({ ...prev, [shift]: true }));
    try {
      await Promise.all(
        pending.map((t) =>
          apiClient.post(`/api/staff/tasks/${t.id}/complete`, {}).catch(() => null)
        )
      );
      const updater = (tasks: Task[]) =>
        tasks.map((t) =>
          t.status === 'pending'
            ? { ...t, status: 'completed' as const, completed_at: new Date().toISOString() }
            : t
        );
      if (shift === 'opening') setOpeningTasks(updater);
      else setClosingTasks(updater);
    } catch {
      Alert.alert('Error', 'Some tasks could not be completed.');
    } finally {
      setBulkCompleting((prev) => ({ ...prev, [shift]: false }));
    }
  }, [openingTasks, closingTasks]);

  // ── Section data ──────────────────────────────────────────────────────────

  const sections: SectionData[] = [
    { title: 'Opening', shift: 'opening', data: openingTasks },
    { title: 'Closing', shift: 'closing', data: closingTasks },
  ];

  const openingPending = openingTasks.filter((t) => t.status === 'pending').length;
  const closingPending = closingTasks.filter((t) => t.status === 'pending').length;
  const totalPending = openingPending + closingPending;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Checklists</Text>
        <Text style={styles.pendingCount}>
          {totalPending > 0 ? `${totalPending} left` : 'All done'}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={Colors.primary} size="large" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          renderSectionHeader={({ section }) => {
            const pending =
              section.shift === 'opening' ? openingPending : closingPending;
            return (
              <SectionHeader
                title={section.title}
                shift={section.shift}
                pendingCount={pending}
                onCompleteAll={completeAll}
                bulkCompleting={bulkCompleting[section.shift]}
              />
            );
          }}
          renderItem={({ item, index }) => (
            <TaskRow
              item={item}
              index={index}
              onToggle={handleToggle}
              onPhotoPress={handlePhotoPress}
              completing={!!completing[item.id]}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>✅</Text>
              <Text style={styles.emptyTitle}>No tasks today</Text>
              <Text style={styles.emptyDesc}>Tasks will appear here once your manager assigns them.</Text>
            </View>
          }
          renderSectionFooter={() => <View style={{ height: Spacing.md }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  loader: { marginTop: 60 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  back: { fontSize: FontSize.lg, color: Colors.primary, fontWeight: '600', width: 60 },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  pendingCount: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    width: 60,
    textAlign: 'right',
  },

  // List
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionEmoji: { fontSize: FontSize.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textInverse },
  bulkBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    minWidth: 80,
    alignItems: 'center',
  },
  bulkBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },

  // Task row
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  taskRowDone: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.border,
    opacity: 0.75,
  },

  // Checkbox
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxDone: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  checkmark: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textInverse,
  },

  // Task content
  taskContent: { flex: 1, gap: 2 },
  taskTitle: { fontSize: FontSize.base, fontWeight: '500', color: Colors.textPrimary },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textDisabled,
  },
  completedTime: { fontSize: FontSize.xs, color: Colors.success },

  // Photo
  photoBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoBtnDone: { borderStyle: 'solid', borderColor: Colors.success },
  photoIcon: { fontSize: 18 },
  photoThumb: { width: 40, height: 40, borderRadius: Radius.sm },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: Spacing.sm,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  emptyDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },

  disabled: { opacity: 0.5 },
});

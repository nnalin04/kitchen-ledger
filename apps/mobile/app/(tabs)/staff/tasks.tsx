import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';
import { format } from 'date-fns';

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  requires_photo: boolean;
  status: 'pending' | 'completed';
  due_time?: string;
  completed_at?: string;
  photo_url?: string;
}

const PRIORITY_COLORS = {
  high: Colors.danger,
  medium: Colors.warning,
  low: Colors.success,
};

export default function TasksScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [cameraRef, setCameraRef] = useState<any>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const load = async () => {
    try {
      const { data } = await apiClient.get('/api/staff/tasks?assigned_to_me=true&status=pending,completed&limit=50');
      setTasks(data.items ?? []);
    } catch {}
    setLoading(false);
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  useEffect(() => { load(); }, []);

  const completeTask = async (task: Task) => {
    if (task.requires_photo) {
      if (!permission?.granted) {
        await requestPermission();
      }
      setPendingTaskId(task.id);
      setShowCamera(true);
      return;
    }
    await doComplete(task.id, undefined);
  };

  const captureAndComplete = async () => {
    if (!cameraRef || !pendingTaskId) return;
    setCompleting(pendingTaskId);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.7 });
      setShowCamera(false);

      const form = new FormData();
      form.append('image', { uri: photo.uri, type: 'image/jpeg', name: 'task.jpg' } as any);
      form.append('purpose', 'general');

      const { data: fileData } = await apiClient.post('/api/files/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      await doComplete(pendingTaskId, fileData.data?.publicUrl);
    } catch {
      Alert.alert('Error', 'Could not capture photo.');
    } finally {
      setCompleting(null);
      setPendingTaskId(null);
    }
  };

  const doComplete = async (taskId: string, photoUrl?: string) => {
    setCompleting(taskId);
    try {
      await apiClient.patch(`/api/staff/tasks/${taskId}/complete`, {
        photo_url: photoUrl,
      });
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not complete task.');
    } finally {
      setCompleting(null);
    }
  };

  if (showCamera) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView style={{ flex: 1 }} ref={setCameraRef} facing="back">
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraHint}>Take a photo to complete this task</Text>
            <View style={styles.cameraActions}>
              <TouchableOpacity onPress={() => { setShowCamera(false); setPendingTaskId(null); }}>
                <Text style={styles.cameraCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.captureBtn} onPress={captureAndComplete}>
                <Text style={styles.captureIcon}>📸</Text>
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  const pending = tasks.filter((t) => t.status === 'pending');
  const completed = tasks.filter((t) => t.status === 'completed');

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Tasks</Text>
        <Text style={styles.count}>{pending.length} pending</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <FlatList
          data={[...pending, ...completed]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>✅</Text>
              <Text style={styles.emptyTitle}>All tasks done!</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.taskCard, item.status === 'completed' && styles.taskCardDone]}>
              <View style={styles.taskTop}>
                <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[item.priority] + '20' }]}>
                  <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[item.priority] }]} />
                  <Text style={[styles.priorityText, { color: PRIORITY_COLORS[item.priority] }]}>
                    {item.priority}
                  </Text>
                </View>
                {item.requires_photo && (
                  <Text style={styles.photoTag}>📷 Requires photo</Text>
                )}
              </View>

              <Text style={[styles.taskTitle, item.status === 'completed' && styles.taskTitleDone]}>
                {item.title}
              </Text>

              {item.description && (
                <Text style={styles.taskDesc}>{item.description}</Text>
              )}

              {item.due_time && (
                <Text style={styles.dueTime}>
                  Due {format(new Date(item.due_time), 'h:mm a')}
                </Text>
              )}

              {item.status === 'completed' ? (
                <Text style={styles.completedAt}>
                  ✓ Completed {item.completed_at ? format(new Date(item.completed_at), 'h:mm a') : ''}
                </Text>
              ) : (
                <TouchableOpacity
                  style={[styles.completeBtn, completing === item.id && styles.disabled]}
                  onPress={() => completeTask(item)}
                  disabled={completing === item.id}
                >
                  {completing === item.id ? (
                    <ActivityIndicator color={Colors.textInverse} size="small" />
                  ) : (
                    <Text style={styles.completeBtnText}>
                      {item.requires_photo ? '📷 Complete with Photo' : '✓ Mark Complete'}
                    </Text>
                  )}
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
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  back: { fontSize: FontSize.lg, color: Colors.primary, fontWeight: '600', width: 60 },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  count: { fontSize: FontSize.sm, color: Colors.textSecondary, width: 60, textAlign: 'right' },
  list: { padding: Spacing.md, gap: Spacing.md },
  empty: { alignItems: 'center', paddingTop: 60, gap: Spacing.sm },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  taskCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  taskCardDone: { opacity: 0.6, backgroundColor: Colors.surfaceElevated },
  taskTop: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityText: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'capitalize' },
  photoTag: { fontSize: FontSize.xs, color: Colors.textSecondary },
  taskTitle: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  taskTitleDone: { textDecorationLine: 'line-through', color: Colors.textDisabled },
  taskDesc: { fontSize: FontSize.sm, color: Colors.textSecondary },
  dueTime: { fontSize: FontSize.xs, color: Colors.textSecondary },
  completedAt: { fontSize: FontSize.xs, color: Colors.success, fontWeight: '600' },
  completeBtn: {
    backgroundColor: Colors.success,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  completeBtnText: { fontSize: FontSize.sm, color: Colors.textInverse, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  cameraOverlay: { flex: 1, justifyContent: 'flex-end', padding: Spacing.xl, gap: Spacing.xl },
  cameraHint: { color: Colors.textInverse, textAlign: 'center', fontSize: FontSize.base, fontWeight: '600' },
  cameraActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cameraCancel: { color: Colors.textInverse, fontSize: FontSize.base, fontWeight: '600' },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  captureIcon: { fontSize: 32 },
});

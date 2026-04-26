import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';
import { format } from 'date-fns';

interface ClockState {
  is_clocked_in: boolean;
  clock_in_time?: string;
  shift_id?: string;
  role?: string;
}

export default function ClockScreen() {
  const router = useRouter();
  const [state, setState] = useState<ClockState | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [elapsed, setElapsed] = useState('0:00:00');

  useEffect(() => {
    apiClient.get('/api/staff/attendance/status').then(({ data }) => {
      setState(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!state?.is_clocked_in || !state.clock_in_time) return;
    const interval = setInterval(() => {
      const ms = Date.now() - new Date(state.clock_in_time!).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setElapsed(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  const getLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch {
      return null;
    }
  };

  const clockIn = async () => {
    setWorking(true);
    try {
      const location = await getLocation();
      const { data } = await apiClient.post('/api/staff/attendance/clock-in', {
        location: location ?? undefined,
      });
      setState({ is_clocked_in: true, clock_in_time: data.clock_in_time, shift_id: data.shift_id, role: data.role });
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not clock in.');
    } finally {
      setWorking(false);
    }
  };

  const clockOut = async () => {
    Alert.alert('Clock Out', 'Are you sure you want to clock out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clock Out',
        style: 'destructive',
        onPress: async () => {
          setWorking(true);
          try {
            await apiClient.post('/api/staff/attendance/clock-out');
            setState({ is_clocked_in: false });
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.message ?? 'Could not clock out.');
          } finally {
            setWorking(false);
          }
        },
      },
    ]);
  };

  if (loading) return <SafeAreaView style={styles.root}><ActivityIndicator style={{ flex: 1 }} color={Colors.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.center}>
        <View style={[styles.statusCircle, state?.is_clocked_in && styles.statusCircleIn]}>
          <Text style={styles.statusEmoji}>{state?.is_clocked_in ? '✅' : '⏰'}</Text>
        </View>

        <Text style={styles.statusText}>
          {state?.is_clocked_in ? 'Clocked In' : 'Not Clocked In'}
        </Text>

        {state?.is_clocked_in && state.clock_in_time && (
          <>
            <Text style={styles.clockTime}>
              Since {format(new Date(state.clock_in_time), 'h:mm a')}
            </Text>
            <Text style={styles.elapsed}>{elapsed}</Text>
            {state.role && <Text style={styles.role}>{state.role}</Text>}
          </>
        )}

        <TouchableOpacity
          style={[styles.btn, state?.is_clocked_in ? styles.btnOut : styles.btnIn, working && styles.btnDisabled]}
          onPress={state?.is_clocked_in ? clockOut : clockIn}
          disabled={working}
          activeOpacity={0.85}
        >
          {working ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <Text style={styles.btnText}>{state?.is_clocked_in ? 'Clock Out' : 'Clock In'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  back: { fontSize: FontSize.lg, color: Colors.primary, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  statusCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.border,
  },
  statusCircleIn: { backgroundColor: '#dcfce7', borderColor: Colors.success },
  statusEmoji: { fontSize: 48 },
  statusText: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary },
  clockTime: { fontSize: FontSize.base, color: Colors.textSecondary },
  elapsed: {
    fontSize: 40,
    fontWeight: '300',
    color: Colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? undefined : 'monospace',
    ...(Platform.OS === 'ios' ? { fontVariant: ['tabular-nums'] as any } : {}),
  },
  role: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  btn: {
    width: 200,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  btnIn: { backgroundColor: Colors.success },
  btnOut: { backgroundColor: Colors.danger },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textInverse },
});

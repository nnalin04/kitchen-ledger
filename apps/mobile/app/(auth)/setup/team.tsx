import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type InviteRole = 'manager' | 'staff';

const ROLES: { value: InviteRole; label: string; description: string }[] = [
  { value: 'manager', label: 'Manager', description: 'Full access except billing' },
  { value: 'staff', label: 'Staff', description: 'Inventory and tasks only' },
];

// ---------------------------------------------------------------------------
// Progress indicator (shared pattern with restaurant.tsx)
// ---------------------------------------------------------------------------

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={progressStyles.wrapper}>
      <Text style={progressStyles.label}>
        Step {step} of {total}
      </Text>
      <View style={progressStyles.track}>
        <View style={[progressStyles.fill, { width: `${(step / total) * 100}%` }]} />
      </View>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  wrapper: { gap: Spacing.xs, marginBottom: Spacing.lg },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  track: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
});

// ---------------------------------------------------------------------------
// Finish helper — marks onboarding done then navigates to dashboard
// ---------------------------------------------------------------------------

async function finishOnboarding(): Promise<void> {
  try {
    await apiClient.patch('/api/auth/tenant/settings', { onboarding_done: true });
  } catch {
    // Non-fatal: onboarding_done flag is a best-effort update
  }
  router.replace('/(tabs)/dashboard');
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function SetupTeamScreen() {
  const [memberName, setMemberName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('staff');
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const handleSendInvite = async () => {
    if (!memberName.trim()) {
      Alert.alert('Missing field', 'Please enter the team member's name.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Missing field', 'Please enter an email address.');
      return;
    }

    setInviting(true);
    try {
      await apiClient.post('/api/auth/users/invite', {
        name: memberName.trim(),
        email: email.trim().toLowerCase(),
        role,
      });
      setInvited(true);
    } catch (e: any) {
      Alert.alert(
        'Invite failed',
        e?.response?.data?.message ?? 'Could not send the invite. Please try again.',
      );
    } finally {
      setInviting(false);
    }
  };

  const handleFinish = async () => {
    setSkipping(true);
    await finishOnboarding();
    // navigation handled inside finishOnboarding; setSkipping(false) not needed
  };

  const handleSkip = async () => {
    setSkipping(true);
    await finishOnboarding();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ProgressBar step={2} total={2} />

          <Text style={styles.heading}>Invite Your First Team Member</Text>
          <Text style={styles.subheading}>
            Optional — you can always invite more staff later from Settings.
          </Text>

          {/* Success state */}
          {invited ? (
            <View style={styles.successCard}>
              <Text style={styles.successIcon}>✅</Text>
              <Text style={styles.successTitle}>Invite sent!</Text>
              <Text style={styles.successBody}>
                {email} will receive an email to join your restaurant.
              </Text>
            </View>
          ) : (
            <>
              {/* Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={memberName}
                  onChangeText={setMemberName}
                  placeholder="Jane Doe"
                  placeholderTextColor={Colors.textDisabled}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="manager@restaurant.com"
                  placeholderTextColor={Colors.textDisabled}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
              </View>

              {/* Role */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Role</Text>
                <View style={styles.roleOptions}>
                  {ROLES.map((r) => {
                    const active = r.value === role;
                    return (
                      <TouchableOpacity
                        key={r.value}
                        style={[styles.roleCard, active && styles.roleCardActive]}
                        onPress={() => setRole(r.value)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.roleLabel, active && styles.roleLabelActive]}>
                          {r.label}
                        </Text>
                        <Text style={[styles.roleDesc, active && styles.roleDescActive]}>
                          {r.description}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Send invite */}
              <TouchableOpacity
                style={[styles.primaryButton, inviting && styles.buttonDisabled]}
                onPress={handleSendInvite}
                disabled={inviting}
                activeOpacity={0.8}
              >
                {inviting ? (
                  <ActivityIndicator color={Colors.textInverse} />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Invite</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            {invited ? (
              <TouchableOpacity
                style={[styles.primaryButton, skipping && styles.buttonDisabled]}
                onPress={handleFinish}
                disabled={skipping}
                activeOpacity={0.8}
              >
                {skipping ? (
                  <ActivityIndicator color={Colors.textInverse} />
                ) : (
                  <Text style={styles.primaryButtonText}>Go to Dashboard</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.skipButton}
                onPress={handleSkip}
                disabled={skipping}
                activeOpacity={0.7}
              >
                {skipping ? (
                  <ActivityIndicator color={Colors.textSecondary} size="small" />
                ) : (
                  <Text style={styles.skipText}>Skip — I'll invite people later</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  kav: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  heading: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: Spacing.xs,
  },
  subheading: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  fieldGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
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
  roleOptions: {
    gap: Spacing.sm,
  },
  roleCard: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
  },
  roleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#ede9fe',
  },
  roleLabel: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  roleLabelActive: {
    color: Colors.primary,
  },
  roleDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  roleDescActive: {
    color: Colors.primaryDark ?? Colors.primary,
  },
  primaryButton: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  footer: {
    marginTop: Spacing.lg,
  },
  skipButton: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  successCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  successIcon: {
    fontSize: 40,
  },
  successTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.success,
  },
  successBody: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

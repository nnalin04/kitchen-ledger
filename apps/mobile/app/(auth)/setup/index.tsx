import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';

const BULLETS: { icon: string; text: string }[] = [
  { icon: '📦', text: 'Track inventory & prevent waste' },
  { icon: '💰', text: 'Manage finances & daily reports' },
  { icon: '👥', text: 'Schedule staff & log attendance' },
];

export default function SetupWelcomeScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.emoji}>🍳</Text>
          <Text style={styles.heading}>Welcome to KitchenLedger</Text>
          <Text style={styles.subheading}>
            Your all-in-one restaurant management platform. Let's get you set up in under 2 minutes.
          </Text>
        </View>

        {/* Value props */}
        <View style={styles.bullets}>
          {BULLETS.map((b) => (
            <View key={b.text} style={styles.bulletRow}>
              <Text style={styles.bulletIcon}>{b.icon}</Text>
              <Text style={styles.bulletText}>{b.text}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/(auth)/setup/restaurant')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Let's set up your restaurant</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => router.replace('/(tabs)/dashboard')}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  emoji: {
    fontSize: 72,
    marginBottom: Spacing.lg,
  },
  heading: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: Spacing.md,
  },
  subheading: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  bullets: {
    gap: Spacing.md,
    marginVertical: Spacing.xxl,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  bulletIcon: {
    fontSize: FontSize.xl,
  },
  bulletText: {
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    fontWeight: '500',
    flex: 1,
  },
  actions: {
    gap: Spacing.sm,
  },
  primaryButton: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  skipButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});

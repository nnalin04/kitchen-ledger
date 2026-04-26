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
import { useAuthStore } from '../../../stores/auth.store';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type RestaurantType = 'full_service' | 'quick_service' | 'cafe' | 'food_truck' | 'bar';

const RESTAURANT_TYPES: { value: RestaurantType; label: string }[] = [
  { value: 'full_service', label: 'Full Service' },
  { value: 'quick_service', label: 'Quick Service' },
  { value: 'cafe', label: 'Café' },
  { value: 'food_truck', label: 'Food Truck' },
  { value: 'bar', label: 'Bar' },
];

const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Asia/Kolkata', label: 'India (IST, UTC+5:30)' },
  { value: 'America/New_York', label: 'US Eastern (EST/EDT)' },
  { value: 'America/Chicago', label: 'US Central (CST/CDT)' },
  { value: 'America/Denver', label: 'US Mountain (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PST/PDT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST, UTC+4)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

const CURRENCIES: { value: string; label: string }[] = [
  { value: 'USD', label: 'USD — US Dollar ($)' },
  { value: 'INR', label: 'INR — Indian Rupee (₹)' },
  { value: 'GBP', label: 'GBP — British Pound (£)' },
  { value: 'EUR', label: 'EUR — Euro (€)' },
  { value: 'AED', label: 'AED — UAE Dirham (د.إ)' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PickerRow<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={pickerStyles.wrapper}>
      <Text style={pickerStyles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pickerStyles.scroll}>
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[pickerStyles.chip, active && pickerStyles.chipActive]}
              onPress={() => onSelect(opt.value)}
              activeOpacity={0.8}
            >
              <Text style={[pickerStyles.chipText, active && pickerStyles.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  wrapper: { gap: Spacing.sm },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  scroll: { flexGrow: 0 },
  chip: {
    height: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: '#ede9fe',
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Progress indicator
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
// Main screen
// ---------------------------------------------------------------------------

export default function SetupRestaurantScreen() {
  const { tenant } = useAuthStore();

  const [name, setName] = useState(tenant?.name ?? '');
  const [type, setType] = useState<RestaurantType>('full_service');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [currency, setCurrency] = useState('INR');
  const [saving, setSaving] = useState(false);

  const handleNext = async () => {
    if (!name.trim()) {
      Alert.alert('Missing field', 'Please enter your restaurant name.');
      return;
    }

    setSaving(true);
    try {
      await apiClient.patch('/api/auth/tenant/settings', {
        name: name.trim(),
        restaurantType: type,
        timezone,
        currency,
      });
      router.push('/(auth)/setup/team');
    } catch (e: any) {
      Alert.alert(
        'Could not save',
        e?.response?.data?.message ?? 'Failed to save restaurant details. Please try again.',
      );
    } finally {
      setSaving(false);
    }
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
          <ProgressBar step={1} total={2} />

          <Text style={styles.heading}>Your Restaurant</Text>
          <Text style={styles.subheading}>Tell us a bit about your place.</Text>

          {/* Restaurant name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Restaurant Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="The Golden Spoon"
              placeholderTextColor={Colors.textDisabled}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          {/* Restaurant type */}
          <View style={styles.fieldGroup}>
            <PickerRow
              label="Restaurant Type"
              options={RESTAURANT_TYPES}
              selected={type}
              onSelect={setType}
            />
          </View>

          {/* Timezone */}
          <View style={styles.fieldGroup}>
            <PickerRow
              label="Timezone"
              options={TIMEZONES}
              selected={timezone}
              onSelect={setTimezone}
            />
          </View>

          {/* Currency */}
          <View style={styles.fieldGroup}>
            <PickerRow
              label="Currency"
              options={CURRENCIES}
              selected={currency}
              onSelect={setCurrency}
            />
          </View>

          {/* Footer buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.nextButton, saving && styles.buttonDisabled]}
              onPress={handleNext}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.nextButtonText}>Next</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
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
  footer: {
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  nextButton: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  nextButtonText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  backButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});

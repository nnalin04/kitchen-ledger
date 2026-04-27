import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  FadeIn,
  ZoomIn,
} from 'react-native-reanimated';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_CHARS = 500;

const ISSUE_CHIPS = [
  'Understaffed',
  'Equipment issue',
  'Rush period',
  'Supply issue',
  'Other',
] as const;

type IssueChip = (typeof ISSUE_CHIPS)[number];

const RATING_LABELS: Record<number, string> = {
  1: 'Rough',
  2: 'Below average',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
};

// ─── Animated star ────────────────────────────────────────────────────────────

interface StarProps {
  index: number;
  filled: boolean;
  onPress: (star: number) => void;
}

function Star({ index, filled, onPress }: StarProps) {
  const scale = useSharedValue(1);

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.7, { duration: 80 }),
      withSpring(1.25, { damping: 6, stiffness: 300 }),
      withSpring(1, { damping: 10, stiffness: 200 })
    );
    onPress(index);
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={{ top: 10, right: 6, bottom: 10, left: 6 }}
      accessibilityRole="button"
      accessibilityLabel={`${index} star${index !== 1 ? 's' : ''}`}
      accessibilityState={{ selected: filled }}
    >
      <Animated.Text style={[styles.star, filled && styles.starFilled, animStyle]}>
        {filled ? '★' : '☆'}
      </Animated.Text>
    </TouchableOpacity>
  );
}

// ─── Issue chip ───────────────────────────────────────────────────────────────

interface ChipProps {
  label: IssueChip;
  selected: boolean;
  onToggle: (chip: IssueChip) => void;
}

function IssueChipView({ label, selected, onToggle }: ChipProps) {
  const scale = useSharedValue(1);

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.94, { duration: 70 }),
      withSpring(1, { damping: 10, stiffness: 250 })
    );
    onToggle(label);
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        style={[styles.chip, selected && styles.chipSelected]}
        onPress={handlePress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
      >
        {selected && <Text style={styles.chipCheck}>✓ </Text>}
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Success overlay ──────────────────────────────────────────────────────────

function SuccessView() {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.successOverlay}>
      <Animated.View entering={ZoomIn.delay(100).duration(350).springify()}>
        <Text style={styles.successEmoji}>🙏</Text>
      </Animated.View>
      <Text style={styles.successTitle}>Thanks for the feedback!</Text>
      <Text style={styles.successDesc}>Your input helps us improve every shift.</Text>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ShiftFeedbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ shiftId: string }>();
  const shiftId = params.shiftId;

  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState('');
  const [selectedIssues, setSelectedIssues] = useState<IssueChip[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const charsLeft = MAX_CHARS - notes.length;

  const toggleIssue = (chip: IssueChip) => {
    setSelectedIssues((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Rating required', 'Please select a star rating before submitting.');
      return;
    }

    if (!shiftId) {
      Alert.alert('No shift', 'Could not identify the shift. Please try again.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post(`/api/staff/shifts/${shiftId}/feedback`, {
        rating,
        issues: selectedIssues,
        notes: notes.trim() || undefined,
      });
      setSubmitted(true);
      setTimeout(() => router.back(), 1800);
    } catch (err: any) {
      const isOffline =
        err?.code === 'ECONNABORTED' ||
        err?.message?.includes('Network') ||
        !err?.response;

      if (isOffline) {
        Alert.alert(
          'Queued for Sync',
          'You appear to be offline. Your feedback will be sent when you reconnect.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Error', err?.response?.data?.message ?? 'Could not submit feedback.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {submitted ? (
        <SuccessView />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text style={styles.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Shift Feedback</Text>
            <View style={{ width: 56 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Star rating */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>How did the shift go?</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    index={star}
                    filled={star <= rating}
                    onPress={setRating}
                  />
                ))}
              </View>
              {rating > 0 && (
                <Animated.Text entering={FadeIn.duration(200)} style={styles.ratingLabel}>
                  {RATING_LABELS[rating]}
                </Animated.Text>
              )}
            </View>

            {/* Issue chips */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Any issues or highlights?</Text>
              <View style={styles.chipsWrap}>
                {ISSUE_CHIPS.map((chip) => (
                  <IssueChipView
                    key={chip}
                    label={chip}
                    selected={selectedIssues.includes(chip)}
                    onToggle={toggleIssue}
                  />
                ))}
              </View>
            </View>

            {/* Notes text area */}
            <View style={styles.section}>
              <View style={styles.notesHeader}>
                <Text style={styles.sectionLabel}>Additional notes</Text>
                <Text style={[styles.charCount, charsLeft < 50 && styles.charCountWarn]}>
                  {charsLeft}
                </Text>
              </View>
              <TextInput
                style={styles.textArea}
                placeholder="How did the shift go? Any wins, blockers, or notes for the next team..."
                placeholderTextColor={Colors.textDisabled}
                value={notes}
                onChangeText={(t) => {
                  if (t.length <= MAX_CHARS) setNotes(t);
                }}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                maxLength={MAX_CHARS}
                accessibilityLabel="Additional notes"
              />
            </View>
          </ScrollView>

          {/* Submit button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                rating === 0 && styles.submitBtnDisabled,
                submitting && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={rating === 0 || submitting}
              accessibilityRole="button"
              accessibilityLabel="Submit feedback"
            >
              {submitting ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.submitBtnText}>Submit Feedback</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Skip feedback"
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  cancelBtn: { fontSize: FontSize.base, color: Colors.textSecondary, fontWeight: '500', width: 56 },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },

  // Scroll
  scroll: {
    padding: Spacing.lg,
    gap: Spacing.xl,
    paddingBottom: Spacing.xl,
  },

  // Sections
  section: { gap: Spacing.md },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Stars
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  star: {
    fontSize: 44,
    color: Colors.border,
    lineHeight: 52,
  },
  starFilled: {
    color: '#f59e0b', // amber — universally recognised for ratings
  },
  ratingLabel: {
    fontSize: FontSize.base,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Chips
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipCheck: {
    fontSize: FontSize.xs,
    color: Colors.textInverse,
    fontWeight: '700',
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    color: Colors.textInverse,
    fontWeight: '600',
  },

  // Notes
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  charCount: {
    fontSize: FontSize.xs,
    color: Colors.textDisabled,
    fontVariant: ['tabular-nums'],
  },
  charCountWarn: { color: Colors.warning },
  textArea: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    minHeight: 120,
    lineHeight: 22,
  },

  // Footer
  footer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  submitBtn: {
    width: '100%',
    height: 56,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  skipText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },

  // Success
  successOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
    backgroundColor: Colors.surface,
  },
  successEmoji: { fontSize: 72 },
  successTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  successDesc: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});

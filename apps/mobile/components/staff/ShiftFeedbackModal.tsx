'use client';

import { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { apiClient } from '../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

// Haptic feedback — gracefully degraded if expo-haptics not present
let Haptics: { selectionAsync?: () => void; notificationAsync?: (type: unknown) => void } = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Haptics = require('expo-haptics');
} catch {
  // expo-haptics not installed — silently skip
}

const ISSUE_CHIPS = [
  'Understaffed',
  'Equipment issues',
  'Communication',
  'Safety concern',
  'Great team',
  'Smooth service',
] as const;

type IssueChip = (typeof ISSUE_CHIPS)[number];

export interface Props {
  visible: boolean;
  shiftId: string | undefined;
  onDismiss: () => void;
}

export default function ShiftFeedbackModal({ visible, shiftId, onDismiss }: Props) {
  const [rating, setRating] = useState<number>(0);
  const [selectedIssues, setSelectedIssues] = useState<IssueChip[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = () => {
    setRating(0);
    setSelectedIssues([]);
    setNotes('');
    setSubmitting(false);
    setSubmitted(false);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  };

  const handleDismiss = () => {
    reset();
    onDismiss();
  };

  const handleStarPress = (star: number) => {
    setRating(star);
    try {
      Haptics.selectionAsync?.();
    } catch {
      // ignore
    }
  };

  const toggleIssue = (chip: IssueChip) => {
    setSelectedIssues((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
    try {
      Haptics.selectionAsync?.();
    } catch {
      // ignore
    }
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Please select a rating');
      return;
    }

    if (!shiftId) {
      // No shift ID returned from clock-out — still dismiss gracefully
      handleDismiss();
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
      dismissTimer.current = setTimeout(() => {
        handleDismiss();
      }, 1500);
    } catch {
      Alert.alert('Error', 'Could not submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    handleDismiss();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleSkip}
      transparent={false}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>How was your shift?</Text>
          <TouchableOpacity
            onPress={handleSkip}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            accessibilityLabel="Close feedback"
            accessibilityRole="button"
          >
            <Text style={styles.closeBtn}>×</Text>
          </TouchableOpacity>
        </View>

        {submitted ? (
          /* Thanks state — auto-dismisses after 1.5 s */
          <View style={styles.thanksContainer}>
            <Text style={styles.thanksText}>Thanks for the feedback! 🙏</Text>
          </View>
        ) : (
          <>
            {/* Star rating */}
            <View style={styles.section}>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => handleStarPress(star)}
                    hitSlop={{ top: 8, right: 4, bottom: 8, left: 4 }}
                    accessibilityLabel={`${star} star${star !== 1 ? 's' : ''}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: star <= rating }}
                  >
                    <Text style={[styles.star, star <= rating && styles.starFilled]}>
                      {star <= rating ? '★' : '☆'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Issue chips */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Any highlights or issues?</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsScroll}
              >
                {ISSUE_CHIPS.map((chip) => {
                  const selected = selectedIssues.includes(chip);
                  return (
                    <TouchableOpacity
                      key={chip}
                      onPress={() => toggleIssue(chip)}
                      style={[styles.chip, selected && styles.chipSelected]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {chip}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Notes */}
            <View style={[styles.section, styles.notesSection]}>
              <TextInput
                style={styles.notesInput}
                placeholder="Anything else? (optional)"
                placeholderTextColor={Colors.textDisabled}
                value={notes}
                onChangeText={setNotes}
                maxLength={280}
                returnKeyType="done"
                accessibilityLabel="Optional notes"
              />
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Submit feedback"
              >
                <Text style={styles.submitBtnText}>
                  {submitting ? 'Submitting…' : 'Submit Feedback'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSkip}
                accessibilityRole="button"
                accessibilityLabel="Skip feedback"
                hitSlop={{ top: 8, right: 0, bottom: 8, left: 0 }}
              >
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingTop: Platform.OS === 'ios' ? Spacing.lg : Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  closeBtn: {
    fontSize: 32,
    lineHeight: 36,
    color: Colors.textSecondary,
    fontWeight: '300',
  },

  // Sections
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },

  // Stars
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  star: {
    fontSize: 40,
    color: Colors.borderStrong,
    lineHeight: 48,
  },
  starFilled: {
    color: '#f59e0b', // amber — universally recognisable for ratings
  },

  // Chips
  chipsScroll: {
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  chip: {
    paddingVertical: Spacing.xs + 2,
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
  notesSection: {
    marginBottom: Spacing.xl,
  },
  notesInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },

  // Actions
  actions: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  submitBtn: {
    width: '100%',
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  skipText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },

  // Thanks
  thanksContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thanksText: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
});

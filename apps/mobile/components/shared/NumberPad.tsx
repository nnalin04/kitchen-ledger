import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

interface Props {
  visible: boolean;
  value: string;
  label?: string;
  unit?: string;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

const KEYS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', '⌫'],
];

export function NumberPad({ visible, value, label, unit, onConfirm, onCancel }: Props) {
  const handleKey = (key: string, onChange: (v: string) => void, current: string) => {
    if (key === '⌫') {
      onChange(current.slice(0, -1) || '0');
    } else if (key === '.' && current.includes('.')) {
      return;
    } else if (current === '0' && key !== '.') {
      onChange(key);
    } else {
      onChange(current + key);
    }
  };

  return null; // Implemented as a stateful wrapper — see NumberPadSheet
}

interface NumberPadSheetProps {
  visible: boolean;
  label?: string;
  unit?: string;
  initialValue?: number;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

export function NumberPadSheet({
  visible,
  label,
  unit,
  initialValue = 0,
  onConfirm,
  onCancel,
}: NumberPadSheetProps) {
  const [display, setDisplay] = useState(initialValue > 0 ? String(initialValue) : '0');

  const press = (key: string) => {
    setDisplay((current) => {
      if (key === '⌫') return current.length > 1 ? current.slice(0, -1) : '0';
      if (key === '.' && current.includes('.')) return current;
      if (current === '0' && key !== '.') return key;
      if (current.replace('.', '').length >= 7) return current;
      return current + key;
    });
  };

  const handleConfirm = () => {
    const num = parseFloat(display);
    if (!isNaN(num) && num >= 0) onConfirm(num);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {label && <Text style={styles.label}>{label}</Text>}
          <View style={styles.display}>
            <Text style={styles.displayText}>{display}</Text>
            {unit && <Text style={styles.unit}>{unit}</Text>}
          </View>

          <View style={styles.grid}>
            {KEYS.map((row, ri) => (
              <View key={ri} style={styles.row}>
                {row.map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.key, key === '⌫' && styles.keyDelete]}
                    onPress={() => press(key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.keyText, key === '⌫' && styles.keyDeleteText]}>
                      {key}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirm} onPress={handleConfirm} activeOpacity={0.8}>
              <Text style={styles.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Hook import needed inside the component file
import { useState } from 'react';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  display: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  displayText: {
    fontSize: 48,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: FontSize.xl,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  grid: { gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm },
  key: {
    flex: 1,
    height: 64,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDelete: { backgroundColor: '#fee2e2' },
  keyText: { fontSize: FontSize.xxl, fontWeight: '600', color: Colors.textPrimary },
  keyDeleteText: { color: Colors.danger },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  cancel: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textSecondary },
  confirm: {
    flex: 2,
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
});

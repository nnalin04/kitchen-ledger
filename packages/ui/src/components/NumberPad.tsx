import React from 'react';

export interface NumberPadProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm?: () => void;
  allowDecimal?: boolean;
  maxLength?: number;
  confirmLabel?: string;
}

export function NumberPad({ value, onChange, onConfirm, allowDecimal = true, maxLength = 10, confirmLabel = '✓' }: NumberPadProps) {
  const handleKey = (key: string) => {
    if (key === 'backspace') {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === '.' && (!allowDecimal || value.includes('.'))) return;
    if (maxLength && value.length >= maxLength) return;
    onChange(value + key);
  };

  const keys = ['7','8','9','4','5','6','1','2','3',allowDecimal ? '.' : '','0','backspace'];

  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {keys.map((key) => key === '' ? (
        <div key="empty" />
      ) : (
        <button
          key={key}
          onClick={() => handleKey(key)}
          className="h-14 rounded-xl bg-gray-100 text-xl font-semibold active:bg-gray-200 hover:bg-gray-200 transition-colors"
        >
          {key === 'backspace' ? '⌫' : key}
        </button>
      ))}
      {onConfirm && (
        <button
          onClick={onConfirm}
          className="col-span-3 h-12 rounded-xl bg-green-500 text-white text-lg font-bold active:bg-green-600 hover:bg-green-600 transition-colors"
        >
          {confirmLabel}
        </button>
      )}
    </div>
  );
}

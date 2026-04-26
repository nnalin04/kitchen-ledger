'use client';

import { motion, AnimatePresence } from 'motion/react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
          />
          <motion.div
            className="relative bg-white rounded-2xl p-6 shadow-2xl z-10 max-w-sm w-full mx-4"
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.18 }}
          >
            <h3 className="font-bold text-gray-900 text-base mb-2">{title}</h3>
            <p className="text-sm text-gray-600 mb-5">{description}</p>
            <div className="flex justify-end gap-3">
              <motion.button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                whileTap={{ scale: 0.97 }}
              >
                Cancel
              </motion.button>
              <motion.button
                onClick={onConfirm}
                className={`px-5 py-2 rounded-lg text-sm font-medium text-white shadow-sm transition-colors ${
                  destructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                {confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

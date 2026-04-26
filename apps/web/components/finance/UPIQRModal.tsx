'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { financeApi } from '@/lib/api/finance.api';

interface UpiQrResult {
  upi_intent_url?: string;
  qr_image_url?: string;
  amount?: number;
  description?: string;
}

export interface UPIQRModalProps {
  open: boolean;
  onClose: () => void;
  reportDate?: string;
  onManualPay?: () => void;
}

export function UPIQRModal({ open, onClose, reportDate, onManualPay }: UPIQRModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UpiQrResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setAmount('');
    setDescription('');
    setLoading(false);
    setResult(null);
    setError('');
    setCopied(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleGenerate = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await financeApi.upi.generateQr({
        amount: parsedAmount,
        description: description || undefined,
        report_date: reportDate,
      });
      setResult(data?.data ?? data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setError(err.response?.data?.error?.message || 'Failed to generate QR. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result?.upi_intent_url) return;
    navigator.clipboard.writeText(result.upi_intent_url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleManualPay = () => {
    reset();
    onManualPay?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">UPI Payment</h2>
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
                  aria-label="Close modal"
                >
                  &times;
                </button>
              </div>

              {!result ? (
                /* ── Input Form ─────────────────────────────── */
                <div className="space-y-4">
                  {reportDate && (
                    <p className="text-xs text-gray-400">
                      For report date: <span className="font-medium text-gray-600">{reportDate}</span>
                    </p>
                  )}

                  {/* Amount */}
                  <div>
                    <label htmlFor="upi-amount" className="block text-sm font-medium text-gray-700 mb-1">
                      Amount
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm pointer-events-none">
                        ₹
                      </span>
                      <input
                        id="upi-amount"
                        type="number"
                        min="1"
                        step="0.01"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Description (optional) */}
                  <div>
                    <label htmlFor="upi-desc" className="block text-sm font-medium text-gray-700 mb-1">
                      Description <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      id="upi-desc"
                      type="text"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="e.g. Daily sales deposit"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={handleGenerate}
                      disabled={loading}
                      className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <svg
                            className="animate-spin h-4 w-4 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v8H4z"
                            />
                          </svg>
                          Generating…
                        </>
                      ) : (
                        'Generate QR'
                      )}
                    </button>
                    <button
                      onClick={handleManualPay}
                      className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      Mark Paid Manually
                    </button>
                  </div>
                </div>
              ) : (
                /* ── QR Result ──────────────────────────────── */
                <motion.div
                  className="space-y-4"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="text-center">
                    <p className="text-sm text-gray-500">
                      Amount:{' '}
                      <span className="font-bold text-gray-900 text-base">
                        ₹{parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  </div>

                  {/* QR image if provided by backend */}
                  {result.qr_image_url && (
                    <div className="flex justify-center">
                      <img
                        src={result.qr_image_url}
                        alt="UPI QR Code"
                        className="w-48 h-48 rounded-lg border border-gray-200"
                      />
                    </div>
                  )}

                  {/* UPI intent URL — copyable */}
                  {result.upi_intent_url && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 text-center">
                        Scan with any UPI app, or copy the payment link:
                      </p>
                      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <a
                          href={result.upi_intent_url}
                          className="flex-1 text-xs text-blue-600 truncate hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {result.upi_intent_url}
                        </a>
                        <button
                          onClick={handleCopy}
                          className="shrink-0 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
                        >
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}

                  {!result.qr_image_url && !result.upi_intent_url && (
                    <p className="text-sm text-gray-500 text-center">
                      QR generated successfully. Ask your customer to scan using any UPI app.
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={reset}
                      className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      Generate Another
                    </button>
                    <button
                      onClick={handleManualPay}
                      className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                    >
                      Mark Paid
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { motion, AnimatePresence } from 'motion/react';
import { financeApi } from '@/lib/api/finance.api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface APSummary {
  total_outstanding: number;
  total_overdue: number;
  due_this_week: number;
}

interface AgingRow {
  vendor_id: string;
  vendor_name: string;
  current: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
}

interface PaymentForm {
  amount: string;
  date: string;
  payment_method: string;
  notes: string;
}

const EMPTY_PAYMENT: PaymentForm = {
  amount: '',
  date: new Date().toISOString().split('T')[0],
  payment_method: 'bank_transfer',
  notes: '',
};

const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer'] as const;

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

function fmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function SummaryCard({
  label,
  value,
  colorClass,
  index,
}: {
  label: string;
  value: number;
  colorClass?: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.25, ease: 'easeOut' }}
      className={`bg-white rounded-xl border border-gray-200/80 shadow-sm border-l-4 ${colorClass ?? 'border-l-gray-200'} p-5`}
    >
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900 mt-1">{fmt(value)}</p>
    </motion.div>
  );
}

function AgingCell({ amount }: { amount: number }) {
  if (amount === 0) return <td className="px-4 py-3 text-right text-gray-300 text-sm">—</td>;
  return <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-gray-800">{fmt(amount)}</td>;
}

export default function AccountsPayablePage() {
  const [paymentDialog, setPaymentDialog] = useState<{ open: boolean; vendorId: string; vendorName: string }>({
    open: false,
    vendorId: '',
    vendorName: '',
  });
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(EMPTY_PAYMENT);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = useSWR(
    'finance/ap/summary',
    () => financeApi.ap.getSummary()
  );

  const { data: agingData, isLoading: agingLoading, error: agingError } = useSWR(
    'finance/ap/aging',
    () => financeApi.ap.getAgingDetail()
  );

  const summary: APSummary = summaryData?.data ?? summaryData ?? { total_outstanding: 0, total_overdue: 0, due_this_week: 0 };
  const agingRows: AgingRow[] = Array.isArray(agingData?.data) ? agingData.data : Array.isArray(agingData) ? agingData : [];

  const setForm = (key: keyof PaymentForm) => (val: string) =>
    setPaymentForm(f => ({ ...f, [key]: val }));

  const openPayment = (vendorId: string, vendorName: string) => {
    setPaymentForm({ ...EMPTY_PAYMENT });
    setPayError('');
    setPaymentDialog({ open: true, vendorId, vendorName });
  };

  const handlePayment = async () => {
    if (!paymentForm.amount || !paymentForm.date) {
      setPayError('Amount and date are required.');
      return;
    }
    setPaying(true);
    setPayError('');
    try {
      await financeApi.vendors.create({
        type: 'payment',
        vendor_id: paymentDialog.vendorId,
        amount: parseFloat(paymentForm.amount),
        date: paymentForm.date,
        payment_method: paymentForm.payment_method,
        notes: paymentForm.notes || undefined,
      });
      setPaymentDialog({ open: false, vendorId: '', vendorName: '' });
      mutate('finance/ap/summary');
      mutate('finance/ap/aging');
    } catch {
      setPayError('Failed to record payment. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  const isLoading = summaryLoading || agingLoading;
  const hasError = summaryError || agingError;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Accounts Payable</h1>
        <p className="text-sm text-gray-500 mt-0.5">Vendor aging and payment tracking</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200/80 shadow-sm border-l-4 border-l-gray-200 p-5 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
              <div className="h-7 bg-gray-200 rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {hasError && <p className="text-sm text-red-600">Failed to load data</p>}

      {!isLoading && !hasError && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              index={0}
              label="Total Outstanding"
              value={summary.total_outstanding}
              colorClass={summary.total_outstanding > 100000 ? 'border-l-red-400' : summary.total_outstanding > 50000 ? 'border-l-amber-400' : 'border-l-emerald-400'}
            />
            <SummaryCard
              index={1}
              label="Overdue"
              value={summary.total_overdue}
              colorClass={summary.total_overdue > 0 ? 'border-l-red-400' : 'border-l-emerald-400'}
            />
            <SummaryCard
              index={2}
              label="Due This Week"
              value={summary.due_this_week}
              colorClass={summary.due_this_week > 25000 ? 'border-l-amber-400' : 'border-l-gray-200'}
            />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.25 }}
            className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden"
          >
            <div className="px-4 py-3 border-b bg-gray-50/80">
              <h2 className="text-sm font-semibold text-gray-700">AP Aging Detail</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 backdrop-blur-sm border-b sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendor</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Current (0–30d)</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">31–60d</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">61–90d</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">90d+</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {agingRows.map((row, index) => (
                    <motion.tr
                      key={row.vendor_id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.04, duration: 0.2 }}
                      className="group hover:bg-blue-50/40 transition-colors border-l-2 border-l-transparent hover:border-l-blue-500"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{row.vendor_name}</td>
                      <AgingCell amount={row.current} />
                      <AgingCell amount={row.days_31_60} />
                      <AgingCell amount={row.days_61_90} />
                      <td className={`px-4 py-3 text-right text-sm font-medium tabular-nums ${row.days_90_plus > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                        {row.days_90_plus > 0 ? fmt(row.days_90_plus) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-900">{fmt(row.total)}</td>
                      <td className="px-4 py-3 text-right">
                        <motion.button
                          onClick={() => openPayment(row.vendor_id, row.vendor_name)}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          className="px-3 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                        >
                          Record Payment
                        </motion.button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
                {agingRows.length > 0 && (
                  <tfoot className="border-t bg-gray-50">
                    <tr>
                      <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Totals</td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-800">
                        {fmt(agingRows.reduce((s, r) => s + r.current, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-800">
                        {fmt(agingRows.reduce((s, r) => s + r.days_31_60, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-800">
                        {fmt(agingRows.reduce((s, r) => s + r.days_61_90, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-red-600">
                        {fmt(agingRows.reduce((s, r) => s + r.days_90_plus, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-900">
                        {fmt(agingRows.reduce((s, r) => s + r.total, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
              {agingRows.length === 0 && (
                <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
                  <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-medium text-sm">No outstanding payables</p>
                  <p className="text-xs">All vendors are fully paid up</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}

      <AnimatePresence>
        {paymentDialog.open && (
          <Dialog
            open={paymentDialog.open}
            onOpenChange={(open: boolean) => setPaymentDialog(d => ({ ...d, open }))}
          >
            <DialogContent className="sm:max-w-md">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.2 }}
              >
                <DialogHeader>
                  <DialogTitle>Record Payment — {paymentDialog.vendorName}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
                    <input
                      type="number"
                      value={paymentForm.amount}
                      onChange={e => setForm('amount')(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
                    <input
                      type="date"
                      value={paymentForm.date}
                      onChange={e => setForm('date')(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                    <Select value={paymentForm.payment_method} onValueChange={setForm('payment_method')}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => (
                          <SelectItem key={m} value={m}>
                            {m === 'bank_transfer' ? 'Bank Transfer' : m.charAt(0).toUpperCase() + m.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={paymentForm.notes}
                      onChange={e => setForm('notes')(e.target.value)}
                      rows={2}
                      placeholder="Reference number, remarks…"
                      className={`${inputClass} resize-none`}
                    />
                  </div>
                  <AnimatePresence>
                    {payError && (
                      <motion.p
                        className="text-sm text-red-600"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                      >
                        {payError}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <div className="flex gap-3 pt-1">
                    <motion.button
                      onClick={handlePayment}
                      disabled={paying}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex-1 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow-md transition-shadow disabled:opacity-50"
                    >
                      {paying ? 'Recording…' : 'Record Payment'}
                    </motion.button>
                    <motion.button
                      onClick={() => setPaymentDialog(d => ({ ...d, open: false }))}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

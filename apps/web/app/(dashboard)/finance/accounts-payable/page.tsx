'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { RoleGuard } from '@/components/layout/RoleGuard';
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

const darkInputClass =
  'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-colors';

function fmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

type SummaryStatus = 'good' | 'warning' | 'danger' | 'neutral';

const STATUS_GLOW: Record<SummaryStatus, string> = {
  good: '0 0 0 1px rgba(34,197,94,0.3), 0 0 16px rgba(34,197,94,0.08)',
  warning: '0 0 0 1px rgba(245,158,11,0.35), 0 0 16px rgba(245,158,11,0.1)',
  danger: '0 0 0 1px rgba(239,68,68,0.4), 0 0 20px rgba(239,68,68,0.12)',
  neutral: '0 0 0 1px rgba(30,41,59,0.8)',
};

const STATUS_VALUE_COLOR: Record<SummaryStatus, string> = {
  good: 'text-emerald-300',
  warning: 'text-amber-300',
  danger: 'text-red-300',
  neutral: 'text-slate-100',
};

function SummaryCard({
  label,
  value,
  status = 'neutral',
  index,
}: {
  label: string;
  value: number;
  status?: SummaryStatus;
  index: number;
}) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.25, ease: 'easeOut' }}
      whileHover={shouldReduce ? {} : { y: -2, transition: { duration: 0.15 } }}
      className="relative overflow-hidden rounded-xl p-5 cursor-default"
      style={{ background: 'rgba(14,18,35,0.95)', boxShadow: STATUS_GLOW[status] }}
    >
      {/* Ledger texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, #94a3b8 0px, #94a3b8 1px, transparent 1px, transparent 24px)',
        }}
      />
      <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase mb-1.5">{label}</p>
      <p className={`font-mono text-2xl font-bold tabular-nums leading-none ${STATUS_VALUE_COLOR[status]}`}>
        {fmt(value)}
      </p>
    </motion.div>
  );
}

function AgingCell({ amount }: { amount: number }) {
  if (amount === 0) return <td className="px-4 py-3 text-right text-slate-700 text-sm font-mono">—</td>;
  return <td className="px-4 py-3 text-right text-sm font-medium tabular-nums font-mono text-slate-200">{fmt(amount)}</td>;
}

export default function AccountsPayablePage() {
  const shouldReduce = useReducedMotion();
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

  // Derive status for summary cards
  const outstandingStatus: SummaryStatus = summary.total_outstanding > 100000 ? 'danger' : summary.total_outstanding > 50000 ? 'warning' : 'good';
  const overdueStatus: SummaryStatus = summary.total_overdue > 0 ? 'danger' : 'good';
  const dueThisWeekStatus: SummaryStatus = summary.due_this_week > 25000 ? 'warning' : 'neutral';

  return (
    <RoleGuard allowedRoles={['owner']}>
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div>
        <h1 className="font-serif text-2xl text-slate-100">Accounts Payable</h1>
        <p className="text-sm text-slate-400 mt-0.5">Vendor aging and payment tracking</p>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-5 animate-pulse"
              style={{ background: 'rgba(14,18,35,0.9)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
            >
              <div className="h-3 bg-slate-800 rounded w-1/2 mb-3" />
              <div className="h-7 bg-slate-800 rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {hasError && <p className="text-sm text-red-400">Failed to load data</p>}

      {!isLoading && !hasError && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard index={0} label="Total Outstanding" value={summary.total_outstanding} status={outstandingStatus} />
            <SummaryCard index={1} label="Overdue" value={summary.total_overdue} status={overdueStatus} />
            <SummaryCard index={2} label="Due This Week" value={summary.due_this_week} status={dueThisWeekStatus} />
          </div>

          {/* Aging table */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.25 }}
            className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
          >
            <div className="px-4 py-3 border-b border-slate-800/80 flex items-center">
              <h2 className="text-sm font-semibold text-slate-300">AP Aging Detail</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-800 sticky top-0 z-10" style={{ background: 'rgba(10,12,25,0.95)' }}>
                  <tr>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Vendor</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Current (0–30d)</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">31–60d</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">61–90d</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">90d+</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {agingRows.map((row, index) => (
                    <motion.tr
                      key={row.vendor_id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.04, duration: 0.2 }}
                      className="group hover:bg-slate-800/40 transition-colors border-l-2 border-l-transparent hover:border-l-blue-500"
                    >
                      <td className="px-4 py-3 font-medium text-slate-200">{row.vendor_name}</td>
                      <AgingCell amount={row.current} />
                      <AgingCell amount={row.days_31_60} />
                      <AgingCell amount={row.days_61_90} />
                      <td className={`px-4 py-3 text-right text-sm font-medium tabular-nums font-mono ${row.days_90_plus > 0 ? 'text-red-400' : 'text-slate-700'}`}>
                        {row.days_90_plus > 0 ? fmt(row.days_90_plus) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums font-mono text-slate-100">{fmt(row.total)}</td>
                      <td className="px-4 py-3 text-right">
                        <motion.button
                          onClick={() => openPayment(row.vendor_id, row.vendor_name)}
                          whileHover={shouldReduce ? {} : { scale: 1.03 }}
                          whileTap={shouldReduce ? {} : { scale: 0.97 }}
                          className="px-3 py-1 text-xs bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/25 hover:text-blue-300 transition-colors font-medium"
                        >
                          Record Payment
                        </motion.button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
                {agingRows.length > 0 && (
                  <tfoot className="border-t border-slate-800" style={{ background: 'rgba(10,12,25,0.6)' }}>
                    <tr>
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Totals</td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums font-mono text-slate-300">
                        {fmt(agingRows.reduce((s, r) => s + r.current, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums font-mono text-slate-300">
                        {fmt(agingRows.reduce((s, r) => s + r.days_31_60, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums font-mono text-slate-300">
                        {fmt(agingRows.reduce((s, r) => s + r.days_61_90, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums font-mono text-red-400">
                        {fmt(agingRows.reduce((s, r) => s + r.days_90_plus, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums font-mono text-slate-100">
                        {fmt(agingRows.reduce((s, r) => s + r.total, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
              {agingRows.length === 0 && (
                <div className="py-16 flex flex-col items-center gap-3 text-slate-500">
                  <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-medium text-sm text-slate-400">No outstanding payables</p>
                  <p className="text-xs text-slate-600">All vendors are fully paid up</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}

      {/* Payment dialog */}
      <AnimatePresence>
        {paymentDialog.open && (
          <Dialog
            open={paymentDialog.open}
            onOpenChange={(open: boolean) => setPaymentDialog(d => ({ ...d, open }))}
          >
            <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.2 }}
              >
                <DialogHeader>
                  <DialogTitle className="font-serif text-slate-100">Record Payment — {paymentDialog.vendorName}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">Amount (₹) *</label>
                    <input
                      type="number"
                      value={paymentForm.amount}
                      onChange={e => setForm('amount')(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className={darkInputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">Payment Date *</label>
                    <input
                      type="date"
                      value={paymentForm.date}
                      onChange={e => setForm('date')(e.target.value)}
                      className={darkInputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">Payment Method</label>
                    <Select value={paymentForm.payment_method} onValueChange={setForm('payment_method')}>
                      <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-100 focus:ring-blue-500/40 focus:border-blue-500/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                        {PAYMENT_METHODS.map(m => (
                          <SelectItem key={m} value={m} className="focus:bg-slate-800">
                            {m === 'bank_transfer' ? 'Bank Transfer' : m.charAt(0).toUpperCase() + m.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">Notes</label>
                    <textarea
                      value={paymentForm.notes}
                      onChange={e => setForm('notes')(e.target.value)}
                      rows={2}
                      placeholder="Reference number, remarks…"
                      className={`${darkInputClass} resize-none`}
                    />
                  </div>
                  <AnimatePresence>
                    {payError && (
                      <motion.p
                        className="text-sm text-red-400"
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
                      whileHover={shouldReduce ? {} : { scale: 1.02 }}
                      whileTap={shouldReduce ? {} : { scale: 0.97 }}
                      className="flex-1 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                    >
                      {paying ? 'Recording…' : 'Record Payment'}
                    </motion.button>
                    <motion.button
                      onClick={() => setPaymentDialog(d => ({ ...d, open: false }))}
                      whileHover={shouldReduce ? {} : { scale: 1.02 }}
                      whileTap={shouldReduce ? {} : { scale: 0.97 }}
                      className="px-4 py-2 border border-slate-700 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
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
    </RoleGuard>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'motion/react';
import { RoleGuard } from '@/components/layout/RoleGuard';
import { staffApi } from '@/lib/api/staff.api';

// ─── types & helpers ─────────────────────────────────────────────────────────

type ShiftType = 'all' | 'lunch' | 'dinner' | 'brunch';
type DistributionMethod = 'BY_HOURS' | 'BY_ROLE' | 'BY_POINTS';

const SHIFT_TYPES: { key: ShiftType; label: string }[] = [
  { key: 'all', label: 'All Shifts' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'brunch', label: 'Brunch' },
];

const DISTRIBUTION_METHODS: { value: DistributionMethod; label: string; desc: string }[] = [
  { value: 'BY_HOURS', label: 'By Hours Worked', desc: 'Proportional to hours worked during the shift' },
  { value: 'BY_ROLE', label: 'By Role', desc: 'Fixed percentage based on role (server, kitchen, etc.)' },
  { value: 'BY_POINTS', label: 'By Points', desc: 'Custom point-based distribution' },
];

function poolStatusClass(status: string) {
  if (status === 'distributed') return 'bg-green-100 text-green-700';
  if (status === 'pending') return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-500';
}

function poolStatusDot(status: string) {
  if (status === 'distributed') return 'bg-green-500';
  if (status === 'pending') return 'bg-yellow-500';
  return 'bg-gray-400';
}

function distributionBadgeClass(method: string) {
  if (method === 'BY_HOURS') return 'bg-blue-100 text-blue-700';
  if (method === 'BY_ROLE') return 'bg-purple-100 text-purple-700';
  return 'bg-green-100 text-green-700';
}

function distributionBadgeDot(method: string) {
  if (method === 'BY_HOURS') return 'bg-blue-500';
  if (method === 'BY_ROLE') return 'bg-purple-500';
  return 'bg-green-500';
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(n?: number | string) {
  const num = Number(n ?? 0);
  return `₹${num.toFixed(2)}`;
}

// ─── Animated counter hook ────────────────────────────────────────────────────

function useCountUp(target: number, duration = 600) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;

    function step(now: number) {
      const elapsed = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setCount(from + (target - from) * eased);
      if (elapsed < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return count;
}

// ─── Confirm Distribute Dialog ────────────────────────────────────────────────

function ConfirmDialog({
  pool,
  onConfirm,
  onCancel,
  loading,
}: {
  pool: any;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <AnimatePresence>
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
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18 }}
        >
          <h3 className="font-bold text-gray-900 text-base mb-2">Distribute Tips</h3>
          <p className="text-sm text-gray-600 mb-1">
            You are about to distribute{' '}
            <span className="font-semibold tabular-nums text-gray-800">{fmtMoney(pool.totalTips ?? pool.total_tips)}</span> from
            pool <span className="font-semibold text-gray-800">{pool.name ?? pool.id}</span>.
          </p>
          <p className="text-sm text-red-600 mb-5">This action cannot be undone.</p>
          <div className="flex justify-end gap-3">
            <motion.button
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              whileTap={{ scale: 0.97 }}
            >
              Cancel
            </motion.button>
            <motion.button
              onClick={onConfirm}
              disabled={loading}
              className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 shadow-sm"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              {loading ? 'Distributing…' : 'Confirm Distribute'}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Payout Preview Panel ─────────────────────────────────────────────────────

function PayoutRow({ payout, index, total }: { payout: any; index: number; total: number }) {
  const amount = Number(payout.amount ?? payout.share_amount ?? 0);
  const share = total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0';
  const animatedAmount = useCountUp(amount, 600);

  return (
    <motion.tr
      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60 transition-colors"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
    >
      <td className="px-3 py-2 font-medium text-gray-800">
        {payout.employeeName ?? payout.employee_name ?? payout.employee?.fullName ?? '—'}
      </td>
      <td className="px-3 py-2 text-right text-gray-500">
        {payout.basisAmount != null ? fmtMoney(payout.basisAmount) : payout.basis ?? '—'}
      </td>
      <td className="px-3 py-2 text-right text-gray-600">{share}%</td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-800">
        ₹{animatedAmount.toFixed(2)}
      </td>
    </motion.tr>
  );
}

function PayoutPreview({ poolId, onDistribute }: { poolId: string; onDistribute: () => void }) {
  const { data, isLoading } = useSWR(
    `tip-payouts-${poolId}`,
    () => staffApi.tipPools.getPayouts(poolId)
  );

  const payouts: any[] = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);

  if (isLoading) {
    return (
      <div className="mt-4 space-y-2 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-lg" />
        ))}
      </div>
    );
  }

  if (payouts.length === 0) {
    return (
      <div className="mt-4 py-8 flex flex-col items-center gap-2 text-gray-400">
        <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium">No payout data available</p>
      </div>
    );
  }

  const total = payouts.reduce((s, p) => s + Number(p.amount ?? p.share_amount ?? 0), 0);

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">Payout Preview</h4>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Employee</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Basis</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Share %</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p: any, i: number) => (
              <PayoutRow key={i} payout={p} index={i} total={total} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-between items-center">
        <span className="text-xs text-gray-400 font-semibold tabular-nums">Total: {fmtMoney(total)}</span>
        <motion.button
          onClick={onDistribute}
          className="px-4 py-1.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg text-xs font-medium shadow-sm"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          Distribute
        </motion.button>
      </div>
    </div>
  );
}

// ─── Pool Card ────────────────────────────────────────────────────────────────

function PoolCard({
  pool,
  index,
  onDistributeClick,
}: {
  pool: any;
  index: number;
  onDistributeClick: (pool: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const status: string = pool.status ?? 'pending';
  const isDistributed = status === 'distributed';
  const totalTips = Number(pool.totalTips ?? pool.total_tips ?? 0);
  const animatedTips = useCountUp(totalTips, 700);

  return (
    <motion.div
      className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5"
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.22 }}
      whileHover={{ boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-800">{pool.name ?? `Pool ${pool.id?.slice(0, 6) ?? ''}`}</p>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${poolStatusClass(status)}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${poolStatusDot(status)}`} />
              {status}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${distributionBadgeClass(pool.distributionMethod ?? pool.distribution_method ?? '')}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${distributionBadgeDot(pool.distributionMethod ?? pool.distribution_method ?? '')}`} />
              {pool.distributionMethod ?? pool.distribution_method ?? '—'}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
            <span>{fmtDate(pool.date)}</span>
            {pool.shiftType && <span className="capitalize">{pool.shiftType ?? pool.shift_type}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-400">Total Tips</p>
            <p className="font-bold text-lg tabular-nums text-gray-900">
              ₹{animatedTips.toFixed(2)}
            </p>
          </div>
          {!isDistributed && (
            <motion.button
              onClick={() => onDistributeClick(pool)}
              className="px-3 py-1.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg text-xs font-medium shadow-sm"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Distribute
            </motion.button>
          )}
          <motion.button
            onClick={() => setExpanded(v => !v)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs hover:bg-gray-50 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            {expanded ? 'Hide' : 'Preview'}
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <PayoutPreview
              poolId={pool.id}
              onDistribute={() => onDistributeClick(pool)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Create Pool Sheet ────────────────────────────────────────────────────────

interface PoolFormData {
  name: string;
  totalTips: string;
  distributionMethod: DistributionMethod;
  date: string;
  shiftType: string;
}

const EMPTY_POOL_FORM: PoolFormData = {
  name: '',
  totalTips: '',
  distributionMethod: 'BY_HOURS',
  date: new Date().toISOString().split('T')[0],
  shiftType: 'dinner',
};

function CreatePoolSheet({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<PoolFormData>(EMPTY_POOL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.totalTips || Number(form.totalTips) <= 0) {
      setError('Total tips must be greater than 0');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await staffApi.tipPools.create({
        name: form.name || undefined,
        totalTips: Number(form.totalTips),
        distributionMethod: form.distributionMethod,
        date: form.date,
        shiftType: form.shiftType,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to create tip pool');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <motion.div
          className="absolute inset-0 bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <motion.div
          className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg p-6 shadow-2xl z-10"
          initial={{ opacity: 0, scale: 0.97, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 16 }}
          transition={{ duration: 0.18 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Create Tip Pool</h2>
            <motion.button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              &times;
            </motion.button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Pool Name (optional)</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                placeholder="e.g. Friday Dinner Tips"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Total Tips Collected (₹) *</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.totalTips}
                onChange={e => setForm(f => ({ ...f, totalTips: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                placeholder="e.g. 5000.00"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Shift Type *</label>
                <select
                  value={form.shiftType}
                  onChange={e => setForm(f => ({ ...f, shiftType: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                >
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="brunch">Brunch</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Distribution Method *</label>
              <div className="space-y-2">
                {DISTRIBUTION_METHODS.map(method => (
                  <label
                    key={method.value}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      form.distributionMethod === method.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="distributionMethod"
                      value={method.value}
                      checked={form.distributionMethod === method.value}
                      onChange={() => setForm(f => ({ ...f, distributionMethod: method.value }))}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{method.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{method.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <motion.button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                {saving ? 'Creating…' : 'Create Pool'}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TipsPage() {
  const [selectedDate, setSelectedDate] = useState('');
  const [shiftType, setShiftType] = useState<ShiftType>('all');
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [distributeTarget, setDistributeTarget] = useState<any | null>(null);
  const [distributing, setDistributing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const params: Record<string, string> = {};
  if (selectedDate) params.date = selectedDate;
  if (shiftType !== 'all') params.shiftType = shiftType;

  const { data, isLoading, mutate } = useSWR(
    `tip-pools-${selectedDate}-${shiftType}`,
    () => staffApi.tipPools.list(Object.keys(params).length > 0 ? params : undefined)
  );

  const pools: any[] = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);

  const pendingCount = pools.filter(p => (p.status ?? 'pending') === 'pending').length;
  const totalUndistributed = pools
    .filter(p => (p.status ?? 'pending') !== 'distributed')
    .reduce((s, p) => s + Number(p.totalTips ?? p.total_tips ?? 0), 0);

  async function handleDistribute() {
    if (!distributeTarget) return;
    setDistributing(true);
    try {
      await staffApi.tipPools.distribute(distributeTarget.id);
      setToast({ msg: 'Tips distributed successfully', ok: true });
      mutate();
    } catch {
      setToast({ msg: 'Failed to distribute tips', ok: false });
    } finally {
      setDistributing(false);
      setDistributeTarget(null);
      setTimeout(() => setToast(null), 3500);
    }
  }

  return (
    <RoleGuard allowedRoles={['owner', 'manager']}>
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tip Pools</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pendingCount > 0
              ? `${pendingCount} pool${pendingCount > 1 ? 's' : ''} pending — `
              : 'All pools distributed'}
            {pendingCount > 0 && (
              <span className="font-semibold tabular-nums">{fmtMoney(totalUndistributed)} to distribute</span>
            )}
          </p>
        </div>
        <motion.button
          onClick={() => setShowCreateSheet(true)}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-lg shadow-sm"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          + Create Tip Pool
        </motion.button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
          />
        </div>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {SHIFT_TYPES.map(st => (
            <motion.button
              key={st.key}
              onClick={() => setShiftType(st.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                shiftType === st.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              whileTap={{ scale: 0.96 }}
            >
              {st.label}
            </motion.button>
          ))}
        </div>
        {selectedDate && (
          <button
            onClick={() => setSelectedDate('')}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear date
          </button>
        )}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.p
            className={`text-sm px-4 py-2 rounded-lg ${
              toast.ok
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {toast.msg}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Pools list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : pools.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-gray-400 bg-white rounded-xl border border-gray-200">
          <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <p className="font-medium text-sm">No tip pools yet</p>
          <p className="text-xs">Create a pool to calculate and distribute tips fairly</p>
          <motion.button
            onClick={() => setShowCreateSheet(true)}
            className="mt-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-medium shadow-sm"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Create First Pool
          </motion.button>
        </div>
      ) : (
        <div className="space-y-3">
          {pools.map((pool, i) => (
            <PoolCard
              key={pool.id}
              pool={pool}
              index={i}
              onDistributeClick={p => setDistributeTarget(p)}
            />
          ))}
        </div>
      )}

      {/* Create Sheet */}
      {showCreateSheet && (
        <CreatePoolSheet
          onClose={() => setShowCreateSheet(false)}
          onSuccess={() => mutate()}
        />
      )}

      {/* Confirm Distribute Dialog */}
      {distributeTarget && (
        <ConfirmDialog
          pool={distributeTarget}
          onConfirm={handleDistribute}
          onCancel={() => setDistributeTarget(null)}
          loading={distributing}
        />
      )}
    </motion.div>
    </RoleGuard>
  );
}

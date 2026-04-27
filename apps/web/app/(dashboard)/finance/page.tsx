'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { apiClient } from '@/lib/api/client';
import { useRealtimeDsr } from '@/hooks/use-realtime';
import { useAuthStore } from '@/stores/auth.store';

const fetcher = (url: string) => apiClient.get(url).then(r => r.data.data);

// ── Skeleton helpers ──────────────────────────────────────────────────────────

function SkeletonKPICard() {
  const shouldReduce = useReducedMotion();

  return (
    <div className="bg-white rounded-xl border border-l-4 border-l-gray-200 p-5">
      <motion.div
        className="h-3 bg-gray-200 rounded w-1/2 mb-3"
        animate={shouldReduce ? {} : { opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="h-7 bg-gray-200 rounded w-3/4 mb-2"
        animate={shouldReduce ? {} : { opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
      />
      <motion.div
        className="h-3 bg-gray-100 rounded w-1/3"
        animate={shouldReduce ? {} : { opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      />
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value?: number | string;
  prefix?: string;
  suffix?: string;
  benchmarkStatus?: 'good' | 'warning' | 'danger' | 'neutral';
  isLoading?: boolean;
  subtext?: string;
  index?: number;
}

function KPICard({
  label,
  value,
  prefix = '',
  suffix = '',
  benchmarkStatus = 'neutral',
  isLoading,
  subtext,
  index = 0,
}: KPICardProps) {
  const shouldReduce = useReducedMotion();

  const borderColors = {
    good: 'border-l-green-400',
    warning: 'border-l-yellow-400',
    danger: 'border-l-red-400',
    neutral: 'border-l-gray-200',
  };

  const statusDot = {
    good: 'bg-green-400',
    warning: 'bg-yellow-400',
    danger: 'bg-red-400',
    neutral: 'bg-transparent',
  };

  if (isLoading) return <SkeletonKPICard />;

  const formatted =
    typeof value === 'number'
      ? value.toLocaleString('en-IN', { maximumFractionDigits: 1 })
      : value ?? '—';

  return (
    <motion.div
      className={`bg-white rounded-xl border border-l-4 ${borderColors[benchmarkStatus]} p-5`}
      initial={{ opacity: 0, y: shouldReduce ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: 'easeOut' }}
      whileHover={shouldReduce ? {} : { y: -2, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {benchmarkStatus !== 'neutral' && (
          <motion.span
            className={`inline-block w-2 h-2 rounded-full ${statusDot[benchmarkStatus]}`}
            animate={
              shouldReduce || benchmarkStatus === 'good'
                ? {}
                : { scale: [1, 1.35, 1], opacity: [1, 0.55, 1] }
            }
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-1">
        {prefix}
        {formatted}
        {suffix}
      </p>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </motion.div>
  );
}

// ── Quick-nav card ────────────────────────────────────────────────────────────

interface NavCardProps {
  href: string;
  title: string;
  description: string;
  icon: string;
  index?: number;
}

function NavCard({ href, title, description, icon, index = 0 }: NavCardProps) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 + index * 0.07, duration: 0.28, ease: 'easeOut' }}
      whileHover={
        shouldReduce
          ? {}
          : { y: -3, boxShadow: '0 6px 20px rgba(0,0,0,0.09)', borderColor: 'rgb(147,197,253)' }
      }
      className="rounded-xl border bg-white"
      style={{ willChange: 'transform' }}
    >
      <Link
        href={href}
        className="block p-5 group"
      >
        <div className="flex items-start gap-3">
          <motion.span
            className="text-2xl"
            whileHover={shouldReduce ? {} : { scale: 1.15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 20 }}
          >
            {icon}
          </motion.span>
          <div>
            <p className="font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
              {title}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">{description}</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const shouldReduce = useReducedMotion();
  const today = new Date().toISOString().split('T')[0];
  const { tenant } = useAuthStore();
  const { data: kpis, isLoading } = useSWR('/api/finance/dashboard', fetcher, {
    refreshInterval: 60_000,
  });

  // Live DSR updates — revalidates SWR cache when any DSR is reconciled
  useRealtimeDsr(tenant?.id);

  const fcStatus = (pct?: number): 'good' | 'warning' | 'danger' | 'neutral' => {
    if (!pct) return 'neutral';
    if (pct <= 35) return 'good';
    if (pct <= 40) return 'warning';
    return 'danger';
  };

  const apStatus = (amount?: number): 'good' | 'warning' | 'danger' | 'neutral' => {
    if (!amount) return 'neutral';
    if (amount < 10000) return 'good';
    if (amount < 50000) return 'warning';
    return 'danger';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: shouldReduce ? 0 : -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <motion.div
          whileHover={shouldReduce ? {} : { scale: 1.02, boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}
          whileTap={shouldReduce ? {} : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 24 }}
          style={{ borderRadius: '0.5rem' }}
        >
          <Link
            href={`/finance/daily-reports/${today}`}
            className="block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Today&apos;s DSR
          </Link>
        </motion.div>
      </motion.div>

      {/* KPI Row */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="kpi-skeleton"
            className="grid grid-cols-2 lg:grid-cols-3 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonKPICard key={i} />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="kpi-live"
            className="grid grid-cols-2 lg:grid-cols-3 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <KPICard
              label="Net Sales (7 days)"
              value={kpis?.netSales7Day}
              prefix="₹"
              isLoading={false}
              subtext="Rolling 7-day total"
              index={0}
            />
            <KPICard
              label="Food Cost %"
              value={kpis?.foodCostPercent}
              suffix="%"
              benchmarkStatus={fcStatus(kpis?.foodCostPercent)}
              isLoading={false}
              subtext="Benchmark ≤ 35%"
              index={1}
            />
            <KPICard
              label="Outstanding AP"
              value={kpis?.outstandingAP}
              prefix="₹"
              benchmarkStatus={apStatus(kpis?.outstandingAP)}
              isLoading={false}
              subtext="Unpaid vendor bills"
              index={2}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick navigation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.12, duration: 0.3 }}
      >
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Sections
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NavCard
            href={`/finance/daily-reports/${today}`}
            icon="📋"
            title="Daily Sales Report"
            description="Enter & reconcile today's sales"
            index={0}
          />
          <NavCard
            href="/finance/expenses"
            icon="🧾"
            title="Expenses"
            description="Log and track all expenses"
            index={1}
          />
          <NavCard
            href="/finance/reports"
            icon="📊"
            title="P&L Report"
            description="Profit & loss by date range"
            index={2}
          />
          <NavCard
            href="/finance/ap"
            icon="💳"
            title="Accounts Payable"
            description="Vendor aging & payments"
            index={3}
          />
        </div>
      </motion.div>

      {/* Recent DSR hint — animated entrance + subtle pulse on CTA */}
      <motion.div
        className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between"
        initial={{ opacity: 0, y: shouldReduce ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.32, ease: 'easeOut' }}
      >
        <div>
          <p className="text-sm font-medium text-blue-800">
            Have you filed today&apos;s sales report?
          </p>
          <p className="text-xs text-blue-600 mt-0.5">
            It takes less than 2 minutes with the 4-step wizard.
          </p>
        </div>
        <motion.div
          whileHover={shouldReduce ? {} : { scale: 1.04 }}
          whileTap={shouldReduce ? {} : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        >
          <Link
            href={`/finance/daily-reports/${today}`}
            className="text-sm font-semibold text-blue-700 hover:text-blue-900 transition-colors whitespace-nowrap"
          >
            Start now →
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}

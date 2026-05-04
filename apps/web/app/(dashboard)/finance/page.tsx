'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { apiClient } from '@/lib/api/client';
import { useRealtimeDsr } from '@/hooks/use-realtime';
import { useAuthStore } from '@/stores/auth.store';

const fetcher = (url: string) => apiClient.get(url).then((r: { data: { data: unknown } }) => r.data.data);

// ── Status glow tokens ────────────────────────────────────────────────────────

type Status = 'good' | 'warning' | 'danger' | 'neutral';

const STATUS_GLOW: Record<Status, string> = {
  good: '0 0 0 1px rgba(34,197,94,0.3), 0 0 16px rgba(34,197,94,0.08)',
  warning: '0 0 0 1px rgba(245,158,11,0.35), 0 0 16px rgba(245,158,11,0.1)',
  danger: '0 0 0 1px rgba(239,68,68,0.4), 0 0 20px rgba(239,68,68,0.12)',
  neutral: '0 0 0 1px rgba(30,41,59,0.8)',
};

const STATUS_DOT: Record<Status, string> = {
  good: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  neutral: 'bg-slate-600',
};

const STATUS_VALUE_COLOR: Record<Status, string> = {
  good: 'text-emerald-300',
  warning: 'text-amber-300',
  danger: 'text-red-300',
  neutral: 'text-slate-100',
};

// ── Skeleton KPI card ─────────────────────────────────────────────────────────

function SkeletonKPICard() {
  const shouldReduce = useReducedMotion();
  return (
    <div
      className="rounded-xl p-5 animate-pulse"
      style={{ background: 'rgba(14,18,35,0.9)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
    >
      <motion.div
        className="h-2.5 bg-slate-800 rounded w-1/2 mb-3"
        animate={shouldReduce ? {} : { opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="h-7 bg-slate-800 rounded w-3/4 mb-2"
        animate={shouldReduce ? {} : { opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
      />
      <motion.div
        className="h-2.5 bg-slate-800/60 rounded w-1/3"
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
  benchmarkStatus?: Status;
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

  if (isLoading) return <SkeletonKPICard />;

  const formatted =
    typeof value === 'number'
      ? value.toLocaleString('en-IN', { maximumFractionDigits: 1 })
      : value ?? '—';

  return (
    <motion.div
      className="relative overflow-hidden rounded-xl p-5 cursor-default"
      style={{ background: 'rgba(14,18,35,0.95)', boxShadow: STATUS_GLOW[benchmarkStatus] }}
      initial={{ opacity: 0, y: shouldReduce ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: 'easeOut' }}
      whileHover={shouldReduce ? {} : { y: -2, transition: { duration: 0.15 } }}
    >
      {/* Ledger-line texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, #94a3b8 0px, #94a3b8 1px, transparent 1px, transparent 24px)',
        }}
      />

      <div className="flex items-center gap-1.5 mb-1">
        {benchmarkStatus !== 'neutral' && (
          <motion.span
            className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[benchmarkStatus]}`}
            animate={
              shouldReduce || benchmarkStatus === 'good'
                ? {}
                : { scale: [1, 1.35, 1], opacity: [1, 0.55, 1] }
            }
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
          {label}
        </p>
      </div>

      <p className={`font-mono text-2xl font-bold tabular-nums leading-none mt-1 ${STATUS_VALUE_COLOR[benchmarkStatus]}`}>
        {prefix}{formatted}{suffix}
      </p>

      {subtext && (
        <p className="text-[11px] text-slate-600 mt-1.5 font-mono">{subtext}</p>
      )}
    </motion.div>
  );
}

// ── Nav card ──────────────────────────────────────────────────────────────────

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
          : { y: -3, boxShadow: '0 0 0 1px rgba(99,102,241,0.35), 0 8px 24px rgba(0,0,0,0.25)' }
      }
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(14,18,35,0.95)',
        boxShadow: '0 0 0 1px rgba(30,41,59,0.8)',
        willChange: 'transform',
      }}
    >
      <Link href={href} className="block p-5 group">
        <div className="flex items-start gap-3">
          <motion.span
            className="text-2xl"
            whileHover={shouldReduce ? {} : { scale: 1.15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 20 }}
          >
            {icon}
          </motion.span>
          <div>
            <p className="font-semibold text-slate-200 text-sm group-hover:text-blue-400 transition-colors">
              {title}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
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

  useRealtimeDsr(tenant?.id);

  const fcStatus = (pct?: number): Status => {
    if (!pct) return 'neutral';
    if (pct <= 35) return 'good';
    if (pct <= 40) return 'warning';
    return 'danger';
  };

  const apStatus = (amount?: number): Status => {
    if (!amount) return 'neutral';
    if (amount < 10000) return 'good';
    if (amount < 50000) return 'warning';
    return 'danger';
  };

  return (
    <div
      className="min-h-screen p-6 space-y-8"
      style={{ background: 'linear-gradient(160deg, #020617 0%, #0a0f1e 50%, #020617 100%)' }}
    >
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: shouldReduce ? 0 : -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <div>
          <h1 className="font-serif text-2xl text-slate-100">Finance</h1>
          <p className="text-sm text-slate-400 mt-0.5 font-mono">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <motion.div
          whileHover={shouldReduce ? {} : { scale: 1.02, boxShadow: '0 4px 12px rgba(37,99,235,0.4)' }}
          whileTap={shouldReduce ? {} : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 24 }}
          style={{ borderRadius: '0.5rem' }}
        >
          <Link
            href={`/finance/daily-reports/${today}`}
            className="block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Today&apos;s DSR
          </Link>
        </motion.div>
      </motion.div>

      {/* Row label */}
      <motion.p
        className="text-[9px] font-bold tracking-[0.25em] text-slate-600 uppercase -mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        ◈ Financial KPIs
      </motion.p>

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

      {/* Navigation section label */}
      <motion.p
        className="text-[9px] font-bold tracking-[0.25em] text-slate-600 uppercase -mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.28 }}
      >
        ◈ Sections
      </motion.p>

      {/* Quick navigation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.18, duration: 0.3 }}
      >
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

      {/* DSR nudge */}
      <motion.div
        className="rounded-xl p-4 flex items-center justify-between"
        style={{
          background: 'rgba(37,99,235,0.08)',
          boxShadow: '0 0 0 1px rgba(37,99,235,0.2)',
        }}
        initial={{ opacity: 0, y: shouldReduce ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.32, ease: 'easeOut' }}
      >
        <div>
          <p className="text-sm font-medium text-blue-300">
            Have you filed today&apos;s sales report?
          </p>
          <p className="text-xs text-blue-400/70 mt-0.5">
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
            className="text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
          >
            Start now →
          </Link>
        </motion.div>
      </motion.div>

      {/* Footer strip */}
      <motion.div
        className="flex items-center justify-between border-t border-slate-800/60 pt-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <p className="text-[10px] font-mono text-slate-700 tracking-wider">
          KITCHENLEDGER · FINANCE
        </p>
        <Link
          href="/finance/reports"
          className="text-[10px] font-semibold tracking-[0.15em] text-blue-500 hover:text-blue-400 uppercase transition-colors"
        >
          Full P&amp;L Report →
        </Link>
      </motion.div>
    </div>
  );
}

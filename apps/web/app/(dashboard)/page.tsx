'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useFinanceDashboard } from '@/hooks/use-finance';
import { useInventoryAlerts } from '@/hooks/use-inventory';
import { useRealtimeDsr } from '@/hooks/use-realtime';
import { useAuthStore } from '@/stores/auth.store';

// ── Count-up animation ────────────────────────────────────────────────────────

function useCountUp(target: number | undefined, duration = 800): number | undefined {
  const [displayed, setDisplayed] = useState<number | undefined>(undefined);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === undefined) return;
    const start = performance.now();
    const from = displayed ?? 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return displayed;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function pctChange(current?: number, previous?: number): number | undefined {
  if (!current || !previous) return undefined;
  return ((current - previous) / previous) * 100;
}

type Status = 'good' | 'warning' | 'danger' | 'neutral';

function fcStatus(pct?: number): Status {
  if (!pct) return 'neutral';
  if (pct <= 35) return 'good';
  if (pct <= 40) return 'warning';
  return 'danger';
}

function lcStatus(pct?: number): Status {
  if (!pct) return 'neutral';
  if (pct <= 35) return 'good';
  if (pct <= 40) return 'warning';
  return 'danger';
}

function cashStatus(amount?: number): Status {
  if (amount === undefined) return 'neutral';
  if (Math.abs(amount) <= 100) return 'good';
  if (Math.abs(amount) <= 500) return 'warning';
  return 'danger';
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const STATUS_GLOW: Record<Status, string> = {
  good: '0 0 0 1px rgba(34,197,94,0.3), 0 0 16px rgba(34,197,94,0.08)',
  warning: '0 0 0 1px rgba(245,158,11,0.35), 0 0 16px rgba(245,158,11,0.1)',
  danger: '0 0 0 1px rgba(239,68,68,0.4), 0 0 20px rgba(239,68,68,0.12)',
  neutral: '0 0 0 1px rgba(30,41,59,0.8)',
};

const STATUS_BADGE: Record<Status, string> = {
  good: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  danger: 'bg-red-500/15 text-red-400 border border-red-500/30',
  neutral: 'bg-slate-700/50 text-slate-400 border border-slate-700',
};

const STATUS_LABEL: Record<Status, string> = {
  good: 'GOOD',
  warning: 'WATCH',
  danger: 'ALERT',
  neutral: '',
};

const STATUS_DOT: Record<Status, string> = {
  good: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  neutral: 'bg-slate-600',
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-5 animate-pulse"
      style={{ background: 'rgba(14,18,35,0.9)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
    >
      <div className="h-2.5 w-20 rounded bg-slate-700/60 mb-4" />
      <div className="h-8 w-32 rounded bg-slate-700/60 mb-3" />
      <div className="h-2 w-16 rounded bg-slate-700/40" />
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  sublabel?: string;
  value?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  change?: number;
  status?: Status;
  index?: number;
  size?: 'default' | 'large';
}

function KPICard({
  label,
  sublabel,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  change,
  status = 'neutral',
  index = 0,
  size = 'default',
}: KPICardProps) {
  const shouldReduce = useReducedMotion();
  const animated = useCountUp(value, shouldReduce ? 0 : 800);
  const displayValue =
    typeof animated === 'number'
      ? animated.toLocaleString('en-IN', { maximumFractionDigits: decimals })
      : '—';

  const isPulsing = status === 'warning' || status === 'danger';

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduce ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: 'easeOut' }}
      whileHover={shouldReduce ? {} : { y: -2, transition: { duration: 0.15 } }}
      className="relative overflow-hidden rounded-xl p-5 cursor-default group"
      style={{ background: 'rgba(14,18,35,0.95)', boxShadow: STATUS_GLOW[status] }}
    >
      {/* Subtle ledger-line texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, #94a3b8 0px, #94a3b8 1px, transparent 1px, transparent 24px)',
        }}
      />

      {/* Status badge */}
      {status !== 'neutral' && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <motion.span
            className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`}
            animate={shouldReduce || !isPulsing ? {} : { opacity: [1, 0.3, 1], scale: [1, 1.5, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: index * 0.2 }}
          />
          <span className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded ${STATUS_BADGE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
      )}

      {/* Label */}
      <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase mb-1">
        {label}
      </p>
      {sublabel && (
        <p className="text-[9px] text-slate-600 mb-2.5 -mt-0.5">{sublabel}</p>
      )}

      {/* Value */}
      <p
        className={`font-mono font-bold tabular-nums leading-none ${
          size === 'large' ? 'text-4xl' : 'text-2xl'
        } ${
          status === 'good' ? 'text-emerald-300' :
          status === 'warning' ? 'text-amber-300' :
          status === 'danger' ? 'text-red-300' :
          'text-slate-100'
        }`}
      >
        {prefix}
        {displayValue}
        {suffix}
      </p>

      {/* Change indicator */}
      {change !== undefined && (
        <motion.p
          className={`text-[11px] font-mono mt-2 ${change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 + index * 0.06 }}
        >
          {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%{' '}
          <span className="text-slate-600">vs last week</span>
        </motion.p>
      )}

      {/* Hover shimmer */}
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 rounded-xl"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.015) 0%, transparent 60%)',
        }}
        transition={{ duration: 0.2 }}
      />
    </motion.div>
  );
}

// ── Hero Revenue Display ──────────────────────────────────────────────────────

function HeroRevenue({
  value,
  change,
  isLoading,
}: {
  value?: number;
  change?: number;
  isLoading?: boolean;
}) {
  const shouldReduce = useReducedMotion();
  const animated = useCountUp(isLoading ? undefined : value, shouldReduce ? 0 : 1200);
  const isUp = (change ?? 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduce ? 0 : -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative"
    >
      <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500 uppercase mb-2">
        Yesterday&apos;s Revenue
      </p>
      <div className="flex items-end gap-4">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="hero-skeleton"
              className="h-14 w-64 rounded-lg bg-slate-800/80 animate-pulse"
              exit={{ opacity: 0 }}
            />
          ) : (
            <motion.h1
              key="hero-value"
              className="font-mono text-5xl md:text-6xl font-bold text-slate-100 tabular-nums leading-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              ₹
              {typeof animated === 'number'
                ? animated.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                : '—'}
            </motion.h1>
          )}
        </AnimatePresence>
        {change !== undefined && !isLoading && (
          <motion.div
            className={`mb-2 flex items-center gap-1 px-2 py-1 rounded text-sm font-mono font-semibold ${
              isUp
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                : 'bg-red-500/15 text-red-400 border border-red-500/25'
            }`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
          >
            {isUp ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── Low Stock Widget ──────────────────────────────────────────────────────────

interface LowStockItem {
  id: string;
  name: string;
  currentStock: number;
  parLevel: number;
  countUnit: string;
}

function LowStockWidget({ items }: { items: LowStockItem[] }) {
  const shouldReduce = useReducedMotion();

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span className="text-[10px] font-semibold tracking-[0.15em] text-slate-400 uppercase">
            Low Stock
          </span>
          {items.length > 0 && (
            <span className="text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded">
              {items.length}
            </span>
          )}
        </div>
        <a
          href="/inventory"
          className="text-[10px] text-blue-400 hover:text-blue-300 tracking-wider transition-colors"
        >
          VIEW ALL →
        </a>
      </div>

      <div className="p-5">
        {items.length === 0 ? (
          <p className="text-sm text-slate-600 font-mono">All items above PAR ✓</p>
        ) : (
          <ul className="space-y-3">
            {items.slice(0, 6).map((item, i) => {
              const pct = Math.max(0, (item.currentStock / item.parLevel) * 100);
              return (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, x: shouldReduce ? 0 : -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="group/item"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-300 font-medium">{item.name}</span>
                    <span className="font-mono text-xs text-red-400 font-bold">
                      {item.currentStock}{' '}
                      <span className="text-slate-600 font-normal">/ {item.parLevel} {item.countUnit}</span>
                    </span>
                  </div>
                  {/* PAR level bar */}
                  <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: i * 0.05 + 0.2, duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                </motion.li>
              );
            })}
            {items.length > 6 && (
              <li className="text-[10px] text-slate-600 font-mono pt-1">
                +{items.length - 6} more items below PAR
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Expiring Items Widget ─────────────────────────────────────────────────────

interface ExpiringItem {
  id: string;
  name: string;
  expiryDate: string;
  currentStock: number;
  countUnit: string;
}

function ExpiringItemsWidget({ items }: { items: ExpiringItem[] }) {
  const shouldReduce = useReducedMotion();
  const today = new Date();

  function daysUntil(dateStr: string) {
    return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
  }

  function expiryMeta(days: number): { label: string; color: string; bg: string } {
    if (days < 0)  return { label: 'EXPIRED', color: 'text-red-400',    bg: 'bg-red-500/20 border-red-500/30' };
    if (days === 0) return { label: 'TODAY',   color: 'text-red-400',    bg: 'bg-red-500/20 border-red-500/30' };
    if (days <= 2) return { label: `${days}D`, color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/25' };
    return { label: `${days}D`, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20' };
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-[10px] font-semibold tracking-[0.15em] text-slate-400 uppercase">
            Expiring Soon
          </span>
        </div>
        <a
          href="/inventory"
          className="text-[10px] text-blue-400 hover:text-blue-300 tracking-wider transition-colors"
        >
          VIEW ALL →
        </a>
      </div>

      <div className="p-5">
        {items.length === 0 ? (
          <p className="text-sm text-slate-600 font-mono">Nothing expiring this week ✓</p>
        ) : (
          <ul className="divide-y divide-slate-800/60">
            {items.slice(0, 5).map((item, i) => {
              const days = daysUntil(item.expiryDate);
              const { label, color, bg } = expiryMeta(days);
              return (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="text-xs text-slate-300">{item.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-500">
                      {item.currentStock} {item.countUnit}
                    </span>
                    <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border ${bg} ${color}`}>
                      {label}
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const shouldReduce = useReducedMotion();
  const { tenant } = useAuthStore();
  const { data: kpis, isLoading: kpisLoading } = useFinanceDashboard();
  const { data: alerts } = useInventoryAlerts();

  useRealtimeDsr(tenant?.id);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div
      className="min-h-screen p-6 space-y-8"
      style={{ background: 'linear-gradient(160deg, #020617 0%, #0a0f1e 50%, #020617 100%)' }}
    >
      {/* ── Page header ── */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
        initial={{ opacity: 0, y: shouldReduce ? 0 : -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <HeroRevenue
          value={kpis?.netSalesYesterday}
          change={pctChange(kpis?.netSalesYesterday, kpis?.netSalesLastWeekSameDay)}
          isLoading={kpisLoading}
        />

        <div className="text-right">
          <p className="text-slate-400 text-sm font-medium">{greeting},</p>
          <p className="text-slate-200 text-lg font-semibold">{tenant?.name ?? 'your restaurant'}</p>
          <p className="text-[11px] text-slate-600 font-mono mt-1">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
      </motion.div>

      {/* ── KPI Grid ── */}
      <div className="space-y-4">
        {/* Row label */}
        <motion.p
          className="text-[9px] font-bold tracking-[0.25em] text-slate-600 uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          ◈ Operational KPIs — Yesterday
        </motion.p>

        <AnimatePresence mode="wait">
          {kpisLoading ? (
            <motion.div
              key="skeleton"
              className="grid grid-cols-2 lg:grid-cols-4 gap-3"
              exit={{ opacity: 0 }}
            >
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
            </motion.div>
          ) : (
            <motion.div
              key="kpis"
              className="grid grid-cols-2 lg:grid-cols-4 gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <KPICard
                label="Guest Count"
                sublabel="covers served"
                value={kpis?.guestCount}
                index={0}
              />
              <KPICard
                label="Avg Check"
                sublabel="per cover"
                value={kpis?.avgCheckSize}
                prefix="₹"
                decimals={0}
                index={1}
              />
              <KPICard
                label="Cash Over/Short"
                sublabel="vs expected"
                value={kpis?.cashOverShort}
                prefix="₹"
                decimals={0}
                status={cashStatus(kpis?.cashOverShort)}
                index={2}
              />
              <KPICard
                label="SPLH"
                sublabel="sales per labour hr"
                value={kpis?.splh}
                prefix="₹"
                decimals={0}
                index={3}
              />
              <KPICard
                label="Food Cost"
                sublabel="% of revenue"
                value={kpis?.foodCostPercent}
                suffix="%"
                decimals={1}
                status={fcStatus(kpis?.foodCostPercent)}
                index={4}
              />
              <KPICard
                label="Labour Cost"
                sublabel="% of revenue"
                value={kpis?.laborCostPercent}
                suffix="%"
                decimals={1}
                status={lcStatus(kpis?.laborCostPercent)}
                index={5}
              />
              <KPICard
                label="Waste %"
                sublabel="of purchases"
                value={kpis?.wastePercent}
                suffix="%"
                decimals={1}
                status={
                  !kpis?.wastePercent ? 'neutral' :
                  kpis.wastePercent <= 3 ? 'good' :
                  kpis.wastePercent <= 6 ? 'warning' : 'danger'
                }
                index={6}
              />
              <KPICard
                label="AP Aging"
                sublabel="overdue >30 days"
                value={kpis?.apOverdue}
                prefix="₹"
                decimals={0}
                status={
                  !kpis?.apOverdue ? 'neutral' :
                  kpis.apOverdue <= 0 ? 'good' :
                  kpis.apOverdue <= 50000 ? 'warning' : 'danger'
                }
                index={7}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Alerts Row ── */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        initial={{ opacity: 0, y: shouldReduce ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <LowStockWidget items={alerts?.lowStock ?? []} />
        <ExpiringItemsWidget items={alerts?.expiring ?? []} />
      </motion.div>

      {/* ── Footer strip ── */}
      <motion.div
        className="flex items-center justify-between border-t border-slate-800/60 pt-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <p className="text-[10px] font-mono text-slate-700 tracking-wider">
          KITCHENLEDGER · LIVE
        </p>
        <a
          href="/finance"
          className="text-[10px] font-semibold tracking-[0.15em] text-blue-500 hover:text-blue-400 uppercase transition-colors"
        >
          Full P&amp;L Report →
        </a>
      </motion.div>
    </div>
  );
}

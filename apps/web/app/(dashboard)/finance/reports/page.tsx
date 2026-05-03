'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { financeApi } from '@/lib/api/finance.api';
import { reportApi } from '@/lib/api/reports.api';
import { RoleGuard } from '@/components/layout/RoleGuard';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface PLLineItem {
  label: string;
  amount: number;
  percent_of_net?: number;
}

interface PLReport {
  from: string;
  to: string;
  net_sales: number;
  revenue_items?: PLLineItem[];
  cogs_items?: PLLineItem[];
  cogs_total: number;
  gross_profit: number;
  labor_items?: PLLineItem[];
  labor_total: number;
  opex_items?: PLLineItem[];
  opex_total: number;
  net_profit: number;
  food_cost_percent: number;
  labor_percent: number;
  net_profit_percent: number;
}

type Preset = 'this_month' | 'last_month' | 'last_3_months' | 'custom';

const PRESETS: { label: string; value: Preset }[] = [
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'Last 3 Months', value: 'last_3_months' },
  { label: 'Custom', value: 'custom' },
];

function getPresetDates(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (preset === 'this_month') {
    return {
      from: new Date(y, m, 1).toISOString().split('T')[0],
      to: new Date(y, m + 1, 0).toISOString().split('T')[0],
    };
  }
  if (preset === 'last_month') {
    return {
      from: new Date(y, m - 1, 1).toISOString().split('T')[0],
      to: new Date(y, m, 0).toISOString().split('T')[0],
    };
  }
  if (preset === 'last_3_months') {
    return {
      from: new Date(y, m - 3, 1).toISOString().split('T')[0],
      to: new Date(y, m + 1, 0).toISOString().split('T')[0],
    };
  }
  return {
    from: new Date(y, m, 1).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  };
}

type BenchStatus = 'good' | 'warning' | 'danger';

function benchmarkStatus(value: number, type: 'food_cost' | 'labor' | 'net_profit'): BenchStatus {
  if (type === 'food_cost') {
    if (value < 30) return 'good';
    if (value <= 35) return 'warning';
    return 'danger';
  }
  if (type === 'labor') {
    if (value < 30) return 'good';
    if (value <= 35) return 'warning';
    return 'danger';
  }
  if (value > 10) return 'good';
  if (value > 5) return 'warning';
  return 'danger';
}

const BENCH_BADGE: Record<BenchStatus, string> = {
  good: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  danger: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

function BenchmarkBadge({ value, type }: { value: number; type: 'food_cost' | 'labor' | 'net_profit' }) {
  const status = benchmarkStatus(value, type);
  const labels: Record<BenchStatus, string> = {
    good: type === 'net_profit' ? 'Healthy' : 'On Track',
    warning: 'Monitor',
    danger: type === 'net_profit' ? 'Low' : 'High',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BENCH_BADGE[status]}`}>
      {labels[status]}
    </span>
  );
}

function fmt(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function pct(n: number) {
  return n.toFixed(1) + '%';
}

function useCountUp(target: number, enabled: boolean): number {
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const DURATION = 600;

  useEffect(() => {
    if (!enabled) {
      setDisplayed(target);
      return;
    }
    setDisplayed(0);
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const step = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, enabled]);

  return displayed;
}

function KPICard({
  label,
  value,
  type,
  benchmark,
  index,
  animate,
}: {
  label: string;
  value: number;
  type: 'food_cost' | 'labor' | 'net_profit';
  benchmark: string;
  index: number;
  animate: boolean;
}) {
  const shouldReduce = useReducedMotion();
  const displayed = useCountUp(value * 10, animate && !shouldReduce);
  const displayedPct = (displayed / 10).toFixed(1) + '%';
  const status = benchmarkStatus(value, type);
  const valueColor = status === 'good' ? 'text-emerald-300' : status === 'warning' ? 'text-amber-300' : 'text-red-300';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-xl p-5 text-center cursor-default"
      style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
    >
      {/* Ledger-line texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, #94a3b8 0px, #94a3b8 1px, transparent 1px, transparent 24px)',
        }}
      />
      <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase mb-1">{label}</p>
      <p className={`font-mono text-2xl font-bold tabular-nums leading-none mt-1 ${valueColor}`}>{displayedPct}</p>
      <div className="flex justify-center mt-2">
        <BenchmarkBadge value={value} type={type} />
      </div>
      <p className="text-[10px] text-slate-600 mt-1 font-mono">{benchmark}</p>
    </motion.div>
  );
}

const SECTION_ACCENT: Record<string, string> = {
  Revenue: 'border-t-2 border-t-blue-500/60',
  COGS: 'border-t-2 border-t-orange-500/60',
  Labor: 'border-t-2 border-t-violet-500/60',
  OpEx: 'border-t-2 border-t-slate-600',
};

function SectionCard({
  title,
  items,
  total,
  netSales,
  accentKey,
  badge,
  index,
}: {
  title: string;
  items?: PLLineItem[];
  total: number;
  netSales: number;
  accentKey: string;
  badge?: React.ReactNode;
  index: number;
}) {
  const pctOfNet = netSales > 0 ? (total / netSales) * 100 : 0;
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.07, duration: 0.25, ease: 'easeOut' }}
      className={`rounded-xl overflow-hidden ${SECTION_ACCENT[accentKey] ?? ''}`}
      style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
    >
      <div className="px-5 py-3 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-200 text-sm">{title}</h3>
          {badge}
        </div>
        <div className="text-right">
          <p className="font-bold tabular-nums font-mono text-slate-100">₹{fmt(total)}</p>
          <p className="text-[10px] text-slate-500 font-mono">{pct(pctOfNet)} of net sales</p>
        </div>
      </div>
      {items && items.length > 0 && (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-800/40">
            {items.map((item, i) => (
              <tr key={i}>
                <td className="px-5 py-2 text-slate-400">{item.label}</td>
                <td className="px-5 py-2 text-right text-slate-600 text-xs font-mono">
                  {item.percent_of_net != null ? pct(item.percent_of_net) : ''}
                </td>
                <td className="px-5 py-2 text-right font-medium tabular-nums font-mono text-slate-200">₹{fmt(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </motion.div>
  );
}

function generateMockCashFlow(from: string, to: string) {
  const start = new Date(from);
  const end = new Date(to);
  const days: { date: string; inflow: number; outflow: number }[] = [];
  const d = new Date(start);
  while (d <= end && days.length < 30) {
    const inflow = 20000 + Math.random() * 30000;
    const outflow = 12000 + Math.random() * 15000;
    days.push({
      date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      inflow: Math.round(inflow),
      outflow: Math.round(outflow),
    });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const darkInputClass =
  'px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-colors';

export default function ReportsPage() {
  const shouldReduce = useReducedMotion();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [kpiAnimated, setKpiAnimated] = useState(false);

  const { from, to } = useMemo(() => {
    if (preset === 'custom' && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    if (preset !== 'custom') {
      return getPresetDates(preset);
    }
    return getPresetDates('this_month');
  }, [preset, customFrom, customTo]);

  const swrKey = `finance/reports/pl?from=${from}&to=${to}`;
  const { data, isLoading, error } = useSWR(swrKey, () =>
    financeApi.reports.getPL({ start: from, end: to })
  );

  const report: PLReport | null = data?.data ?? data ?? null;

  useEffect(() => {
    if (report) {
      setKpiAnimated(false);
      const t = setTimeout(() => setKpiAnimated(true), 100);
      return () => clearTimeout(t);
    }
  }, [report]);

  const cashFlowData = useMemo(() => generateMockCashFlow(from, to), [from, to]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError('');
    try {
      const createRes = await reportApi.jobs.create({
        report_type: 'pl_custom',
        parameters: { start_date: from, end_date: to },
        output_format: 'pdf',
      });
      const jobId = createRes.data?.id ?? (createRes as unknown as { id: string }).id;
      if (!jobId) throw new Error('No job ID returned');

      let attempts = 0;
      const maxAttempts = 30;
      const poll = async (): Promise<void> => {
        if (attempts >= maxAttempts) throw new Error('Export timed out');
        attempts++;
        const jobRes = await reportApi.jobs.get(jobId);
        const job = jobRes.data ?? (jobRes as unknown as { status: string; download_url?: string });
        if (job.status === 'completed') {
          const dlRes = await reportApi.jobs.download(jobId);
          const url = dlRes.data?.url ?? job.download_url;
          if (url) {
            window.open(url, '_blank', 'noopener');
          }
          return;
        }
        if (job.status === 'failed') {
          throw new Error('PDF generation failed — please try again');
        }
        await new Promise(r => setTimeout(r, 2000));
        return poll();
      };

      await poll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  }, [from, to]);

  return (
    <RoleGuard allowedRoles={['owner']}>
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-slate-100">P&amp;L Report</h1>
          <p className="text-sm text-slate-400 mt-0.5">Profit &amp; loss by date range</p>
        </div>
        <motion.button
          onClick={handleExport}
          disabled={exporting || isLoading}
          whileHover={shouldReduce ? {} : { scale: 1.02 }}
          whileTap={shouldReduce ? {} : { scale: 0.97 }}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-medium text-slate-300 hover:text-slate-100 hover:border-slate-600 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {exporting ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
              Generating PDF…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export PDF
            </>
          )}
        </motion.button>
      </div>

      {/* Export error */}
      <AnimatePresence>
        {exportError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl px-4 py-3 flex items-center justify-between"
            style={{
              background: 'rgba(69,10,10,0.25)',
              boxShadow: '0 0 0 1px rgba(153,27,27,0.5)',
            }}
          >
            <p className="text-sm text-red-400">{exportError}</p>
            <button
              onClick={() => setExportError('')}
              className="text-red-500 hover:text-red-300 transition-colors text-lg leading-none ml-4"
            >
              &times;
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Date range controls */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <motion.button
              key={p.value}
              onClick={() => setPreset(p.value)}
              whileHover={shouldReduce ? {} : { scale: 1.02 }}
              whileTap={shouldReduce ? {} : { scale: 0.97 }}
              className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === p.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {p.label}
              {preset === p.value && (
                <motion.span
                  layoutId="preset-underline"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-400 rounded-full"
                  transition={{ duration: 0.2 }}
                />
              )}
            </motion.button>
          ))}
          <AnimatePresence>
            {preset === 'custom' && (
              <motion.div
                className="flex items-center gap-2 ml-2"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className={darkInputClass}
                />
                <span className="text-slate-500 text-sm">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className={darkInputClass}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {!isLoading && from && to && (
          <p className="text-[10px] text-slate-600 mt-2 font-mono">
            {new Date(from + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' — '}
            {new Date(to + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl p-4 text-center animate-pulse"
                style={{ background: 'rgba(14,18,35,0.9)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
              >
                <div className="h-3 bg-slate-800 rounded w-1/2 mx-auto mb-3" />
                <div className="h-8 bg-slate-800 rounded w-2/3 mx-auto mb-2" />
                <div className="h-5 bg-slate-800/60 rounded-full w-16 mx-auto" />
              </div>
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-5 animate-pulse"
              style={{ background: 'rgba(14,18,35,0.9)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
            >
              <div className="h-4 bg-slate-800 rounded w-1/3 mb-3" />
              <div className="h-3 bg-slate-800/60 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-400">Failed to load data</p>}

      {!isLoading && !error && report && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <KPICard index={0} label="Food Cost %" value={report.food_cost_percent} type="food_cost" benchmark="Benchmark <30%" animate={kpiAnimated} />
            <KPICard index={1} label="Labor %" value={report.labor_percent} type="labor" benchmark="Benchmark <30%" animate={kpiAnimated} />
            <KPICard index={2} label="Net Profit %" value={report.net_profit_percent} type="net_profit" benchmark="Benchmark >10%" animate={kpiAnimated} />
          </div>

          <div className="space-y-4">
            <SectionCard index={0} title="Revenue" items={report.revenue_items} total={report.net_sales} netSales={report.net_sales} accentKey="Revenue" />
            <SectionCard index={1} title="Cost of Goods Sold (COGS)" items={report.cogs_items} total={report.cogs_total} netSales={report.net_sales} accentKey="COGS" badge={<BenchmarkBadge value={report.food_cost_percent} type="food_cost" />} />

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.14, duration: 0.25 }}
              className="rounded-xl p-5 flex items-center justify-between"
              style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
            >
              <p className="font-semibold text-slate-200">Gross Profit</p>
              <div className="text-right">
                <p className="font-bold text-xl tabular-nums font-mono text-slate-100">₹{fmt(report.gross_profit)}</p>
                <p className="text-[10px] text-slate-500 font-mono">
                  {report.net_sales > 0 ? pct((report.gross_profit / report.net_sales) * 100) : '0%'} of net sales
                </p>
              </div>
            </motion.div>

            <SectionCard index={2} title="Labor" items={report.labor_items} total={report.labor_total} netSales={report.net_sales} accentKey="Labor" badge={<BenchmarkBadge value={report.labor_percent} type="labor" />} />
            <SectionCard index={3} title="Operating Expenses" items={report.opex_items} total={report.opex_total} netSales={report.net_sales} accentKey="OpEx" />

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35, duration: 0.25 }}
              className="rounded-xl border p-5 flex items-center justify-between"
              style={
                report.net_profit >= 0
                  ? { background: 'rgba(5,40,18,0.4)', borderColor: 'rgba(34,197,94,0.25)', boxShadow: '0 0 0 1px rgba(34,197,94,0.15)' }
                  : { background: 'rgba(69,10,10,0.3)', borderColor: 'rgba(239,68,68,0.25)', boxShadow: '0 0 0 1px rgba(239,68,68,0.15)' }
              }
            >
              <div className="flex items-center gap-3">
                <p className={`font-bold text-lg ${report.net_profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>Net Profit</p>
                <BenchmarkBadge value={report.net_profit_percent} type="net_profit" />
              </div>
              <div className="text-right">
                <p className={`font-bold text-2xl tabular-nums font-mono ${report.net_profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {report.net_profit < 0 ? '−' : ''}₹{fmt(Math.abs(report.net_profit))}
                </p>
                <p className={`text-[10px] font-mono ${report.net_profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {pct(Math.abs(report.net_profit_percent))} of net sales
                </p>
              </div>
            </motion.div>
          </div>
        </>
      )}

      {!isLoading && !error && !report && (
        <div
          className="rounded-xl py-16 flex flex-col items-center gap-3 text-slate-500"
          style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
        >
          <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="font-medium text-sm text-slate-400">No P&amp;L data available for this period</p>
          <p className="text-xs text-slate-600">Try selecting a different date range</p>
        </div>
      )}

      {/* Cash flow chart */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.25 }}
        className="rounded-xl p-5"
        style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
      >
        <h2 className="text-sm font-semibold text-slate-300 mb-4">30-Day Cash Flow</h2>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={cashFlowData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,41,59,0.8)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(value: number, name: string) => [`₹${fmt(value)}`, name === 'inflow' ? 'Cash In' : 'Cash Out']}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                background: 'rgba(14,18,35,0.98)',
                border: '1px solid rgba(30,41,59,0.9)',
                color: '#e2e8f0',
              }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: '#60a5fa' }}
            />
            <Area type="monotone" dataKey="inflow" stroke="#3b82f6" strokeWidth={2} fill="url(#inflowGrad)" dot={false} isAnimationActive animationDuration={800} />
            <Area type="monotone" dataKey="outflow" stroke="#f97316" strokeWidth={2} fill="url(#outflowGrad)" dot={false} isAnimationActive animationDuration={800} animationBegin={100} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-block w-3 h-0.5 bg-blue-500 rounded" /> Cash In
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-block w-3 h-0.5 bg-orange-400 rounded" /> Cash Out
          </div>
        </div>
      </motion.div>
    </motion.div>
    </RoleGuard>
  );
}

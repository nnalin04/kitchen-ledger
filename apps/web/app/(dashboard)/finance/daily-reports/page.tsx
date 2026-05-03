'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { financeApi } from '@/lib/api/finance.api';

interface TrendDay {
  date: string;
  gross_sales: number;
  status: 'RECONCILED' | 'DRAFT' | 'MISSING';
  reconciled_at?: string;
}

const STATUS_COLOR: Record<string, string> = {
  RECONCILED: 'bg-emerald-500',
  DRAFT: 'bg-amber-400',
  MISSING: 'bg-rose-400',
  FUTURE: 'bg-slate-800',
};

const STATUS_LABEL: Record<string, string> = {
  RECONCILED: 'Reconciled',
  DRAFT: 'Draft',
  MISSING: 'Missing',
  FUTURE: '—',
};

const STATUS_BADGE: Record<string, string> = {
  RECONCILED: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  DRAFT: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  MISSING: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

const STATUS_DOT: Record<string, string> = {
  RECONCILED: 'bg-emerald-400',
  DRAFT: 'bg-amber-400',
  MISSING: 'bg-red-400',
};

function buildCalendarDays(trends: TrendDay[]): Array<{ date: string; status: string; gross_sales?: number; reconciled_at?: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const trendMap = new Map(trends.map(t => [t.date, t]));
  const days: Array<{ date: string; status: string; gross_sales?: number; reconciled_at?: string }> = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const trend = trendMap.get(dateStr);
    if (trend) {
      days.push({ date: dateStr, status: trend.status, gross_sales: trend.gross_sales, reconciled_at: trend.reconciled_at });
    } else if (d > today) {
      days.push({ date: dateStr, status: 'FUTURE' });
    } else {
      days.push({ date: dateStr, status: 'MISSING' });
    }
  }

  return days;
}

function fmt(amount: number) {
  return amount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export default function DailyReportsListPage() {
  const router = useRouter();
  const shouldReduce = useReducedMotion();
  const [view, setView] = useState<'calendar' | 'list'>('calendar');

  const { data, isLoading, error } = useSWR('finance/daily-reports/trends', () =>
    financeApi.dailyReports.listTrends()
  );

  const trends: TrendDay[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  const calendarDays = buildCalendarDays(trends);

  const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const rows: Array<typeof calendarDays> = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    rows.push(calendarDays.slice(i, i + 7));
  }

  const listDays = [...calendarDays]
    .filter(d => d.status !== 'FUTURE')
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-slate-100">Daily Sales Reports</h1>
          <p className="text-sm text-slate-400 mt-0.5 font-mono">Last 30 days</p>
        </div>
        <div className="flex items-center gap-2">
          {(['calendar', 'list'] as const).map(v => (
            <motion.button
              key={v}
              onClick={() => setView(v)}
              whileHover={shouldReduce ? {} : { scale: 1.02 }}
              whileTap={shouldReduce ? {} : { scale: 0.97 }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                view === v
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-sm'
                  : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {v}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        {Object.entries({ RECONCILED: 'Reconciled', DRAFT: 'Draft', MISSING: 'Missing' }).map(([k, label]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${STATUS_COLOR[k]}`} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-800 border border-slate-700" />
          Future
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div
          className="rounded-xl p-6 space-y-3 animate-pulse"
          style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
        >
          <div className="h-4 bg-slate-800 rounded w-1/4" />
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-slate-800 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400">Failed to load data</p>
      )}

      <AnimatePresence mode="wait">
        {!isLoading && !error && view === 'calendar' && (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl p-5"
            style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
          >
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEK_DAYS.map(d => (
                <div key={d} className="text-center text-xs font-medium text-slate-600 py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="space-y-1">
              {rows.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1">
                  {week.map((day, di) => {
                    const dayNum = new Date(day.date + 'T00:00:00').getDate();
                    const isToday = day.date === new Date().toISOString().split('T')[0];
                    const clickable = day.status !== 'FUTURE';
                    return (
                      <motion.button
                        key={day.date}
                        disabled={!clickable}
                        onClick={() => clickable && router.push(`/finance/daily-reports/${day.date}`)}
                        title={`${day.date} — ${STATUS_LABEL[day.status]}${day.gross_sales ? ` — ₹${fmt(day.gross_sales)}` : ''}`}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: (wi * 7 + di) * 0.018, duration: 0.2, ease: 'easeOut' }}
                        whileHover={clickable && !shouldReduce ? { scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' } : {}}
                        whileTap={clickable && !shouldReduce ? { scale: 0.97 } : {}}
                        className={`relative flex flex-col items-center justify-center rounded-lg p-1.5 min-h-[52px] transition-all ${
                          clickable ? 'cursor-pointer' : 'cursor-default opacity-40'
                        } ${STATUS_COLOR[day.status]} ${isToday ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-slate-900' : ''}`}
                      >
                        <span className={`text-xs font-bold ${day.status === 'FUTURE' ? 'text-slate-500' : 'text-white'}`}>
                          {dayNum}
                        </span>
                        {day.gross_sales != null && (
                          <span className="text-[9px] text-white/80 leading-none">
                            ₹{fmt(day.gross_sales)}
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {!isLoading && !error && view === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
          >
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 sticky top-0 z-10" style={{ background: 'rgba(10,12,25,0.95)' }}>
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Date</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Gross Sales</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Reconciled At</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {listDays.map((day, index) => (
                  <motion.tr
                    key={day.date}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.035, duration: 0.2 }}
                    className="group hover:bg-slate-800/40 transition-colors border-l-2 border-l-transparent hover:border-l-blue-500"
                  >
                    <td className="px-4 py-3 font-medium text-slate-200">
                      {new Date(day.date + 'T00:00:00').toLocaleDateString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums font-mono text-slate-100">
                      {day.gross_sales != null ? `₹${fmt(day.gross_sales)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[day.status] ?? 'bg-slate-700/50 text-slate-400 border border-slate-700'}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT[day.status] ?? 'bg-slate-500'}`} />
                        {STATUS_LABEL[day.status] ?? day.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                      {day.reconciled_at
                        ? new Date(day.reconciled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <motion.button
                        onClick={() => router.push(`/finance/daily-reports/${day.date}`)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                      >
                        View →
                      </motion.button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {listDays.length === 0 && (
              <div className="py-16 flex flex-col items-center gap-3 text-slate-500">
                <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="font-medium text-sm text-slate-400">No reports found</p>
                <p className="text-xs text-slate-600">Try adjusting your filters or check back later</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

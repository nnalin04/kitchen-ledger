'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'motion/react';
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
  FUTURE: 'bg-stone-200',
};

const STATUS_LABEL: Record<string, string> = {
  RECONCILED: 'Reconciled',
  DRAFT: 'Draft',
  MISSING: 'Missing',
  FUTURE: '—',
};

const STATUS_BADGE: Record<string, string> = {
  RECONCILED: 'bg-emerald-100 text-emerald-700',
  DRAFT: 'bg-amber-100 text-amber-700',
  MISSING: 'bg-rose-100 text-rose-700',
};

const STATUS_DOT: Record<string, string> = {
  RECONCILED: 'bg-emerald-500',
  DRAFT: 'bg-amber-400',
  MISSING: 'bg-rose-400',
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
          <h1 className="text-2xl font-bold text-gray-900">Daily Sales Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Last 30 days</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => setView('calendar')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === 'calendar' ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-sm' : 'bg-white border border-gray-200/80 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Calendar
          </motion.button>
          <motion.button
            onClick={() => setView('list')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === 'list' ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-sm' : 'bg-white border border-gray-200/80 text-gray-600 hover:bg-gray-50'
            }`}
          >
            List
          </motion.button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        {Object.entries({ RECONCILED: 'Reconciled', DRAFT: 'Draft', MISSING: 'Missing' }).map(([k, label]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 rounded-sm ${STATUS_COLOR[k]}`} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-stone-200" />
          Future
        </div>
      </div>

      {isLoading && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse" />
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 28 }).map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-lg animate-pulse"
                style={{
                  background: `linear-gradient(90deg, #f3f4f6 25%, #e9eaec 50%, #f3f4f6 75%)`,
                  backgroundSize: '200% 100%',
                  animation: `pulse 1.5s ease-in-out ${i * 0.03}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">Failed to load data</p>
      )}

      <AnimatePresence mode="wait">
        {!isLoading && !error && view === 'calendar' && (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5"
          >
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEK_DAYS.map(d => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
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
                        whileHover={clickable ? { scale: 1.05, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : {}}
                        whileTap={clickable ? { scale: 0.97 } : {}}
                        className={`relative flex flex-col items-center justify-center rounded-lg p-1.5 min-h-[52px] transition-all ${
                          clickable ? 'cursor-pointer' : 'cursor-default opacity-50'
                        } ${STATUS_COLOR[day.status]} ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                      >
                        <span className={`text-xs font-bold ${day.status === 'FUTURE' ? 'text-stone-400' : 'text-white'}`}>
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
            className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden"
          >
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 backdrop-blur-sm border-b sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gross Sales</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reconciled At</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {listDays.map((day, index) => (
                  <motion.tr
                    key={day.date}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.035, duration: 0.2 }}
                    className="group hover:bg-blue-50/40 transition-colors border-l-2 border-l-transparent hover:border-l-blue-500"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {new Date(day.date + 'T00:00:00').toLocaleDateString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                      {day.gross_sales != null ? `₹${fmt(day.gross_sales)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[day.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT[day.status] ?? 'bg-gray-400'}`} />
                        {STATUS_LABEL[day.status] ?? day.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {day.reconciled_at
                        ? new Date(day.reconciled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <motion.button
                        onClick={() => router.push(`/finance/daily-reports/${day.date}`)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View →
                      </motion.button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {listDays.length === 0 && (
              <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
                <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="font-medium text-sm">No reports found</p>
                <p className="text-xs">Try adjusting your filters or check back later</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

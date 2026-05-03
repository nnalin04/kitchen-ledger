'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { financeApi } from '@/lib/api/finance.api';
import { DSRWizard, type DSRData } from '@/components/finance/DSRWizard';

// ── Helpers ───────────────────────────────────────────────────────────────────

const INR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);

// ── Read-only Summary ─────────────────────────────────────────────────────────

function ReconciledSummary({ data, date }: { data: DSRData; date: string }) {
  const netSales =
    (data.gross_sales ?? 0) -
    (data.comps ?? 0) -
    (data.voids ?? 0) -
    (data.discounts ?? 0);

  const rows = [
    { label: 'Gross Sales', value: INR(data.gross_sales ?? 0) },
    {
      label: 'Comps / Voids / Discounts',
      value: `−${INR((data.comps ?? 0) + (data.voids ?? 0) + (data.discounts ?? 0))}`,
    },
    { label: 'Net Sales', value: INR(netSales), highlight: true },
    { label: 'Guest Count', value: data.guest_count ? String(data.guest_count) : '—' },
    { label: 'Cash Sales', value: INR(data.cash_sales ?? 0) },
    { label: 'Card Sales', value: INR(data.card_sales ?? 0) },
    { label: 'UPI Sales', value: INR(data.upi_sales ?? 0) },
    { label: 'Delivery Platform', value: INR(data.delivery_platform_sales ?? 0) },
    { label: 'Tips Collected', value: INR(data.tips_collected ?? 0) },
    { label: 'Cash Counted', value: data.cash_counted != null ? INR(data.cash_counted) : '—' },
    {
      label: 'Cash Over/Short',
      value: (() => {
        const os = (data.cash_counted ?? 0) - (data.cash_sales ?? 0);
        return `${os >= 0 ? '+' : ''}${INR(os)}`;
      })(),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Status Banner */}
      <div
        className="rounded-xl p-4 flex items-center gap-3"
        style={{
          background: 'rgba(16,40,24,0.6)',
          boxShadow: '0 0 0 1px rgba(34,197,94,0.25)',
        }}
      >
        <span className="text-2xl">✅</span>
        <div>
          <p className="font-semibold text-emerald-300">Report Reconciled</p>
          <p className="text-sm text-emerald-500/80">Daily sales report for {date} is finalised.</p>
        </div>
      </div>

      {/* Summary Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
      >
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-800/60">
            {rows.map(row => (
              <tr
                key={row.label}
                className={row.highlight ? 'bg-blue-500/10' : ''}
              >
                <td className="px-5 py-3 text-slate-400">{row.label}</td>
                <td
                  className={`px-5 py-3 text-right font-semibold tabular-nums font-mono ${
                    row.highlight ? 'text-blue-300' : 'text-slate-100'
                  }`}
                >
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.variance_explanation && (
        <div
          className="rounded-xl p-4"
          style={{
            background: 'rgba(40,30,10,0.5)',
            boxShadow: '0 0 0 1px rgba(245,158,11,0.25)',
          }}
        >
          <p className="text-xs font-semibold text-amber-400 mb-1">Variance Explanation</p>
          <p className="text-sm text-amber-300/80">{data.variance_explanation}</p>
        </div>
      )}
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DSRPage() {
  const params = useParams();
  const router = useRouter();
  const rawDate = params.date as string;
  const date = rawDate === 'today' ? new Date().toISOString().split('T')[0] : rawDate;

  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<DSRData | null>(null);
  const [isReconciled, setIsReconciled] = useState(false);

  useEffect(() => {
    financeApi.dailyReports
      .get(date)
      .then(res => {
        const d: DSRData = res?.data ?? res;
        setReportData(d);
        setIsReconciled(d?.status === 'RECONCILED');
      })
      .catch(() => {
        setReportData(null);
        setIsReconciled(false);
      })
      .finally(() => setLoading(false));
  }, [date]);

  const handleComplete = () => {
    router.refresh();
    financeApi.dailyReports
      .get(date)
      .then(res => {
        const d: DSRData = res?.data ?? res;
        setReportData(d);
        setIsReconciled(true);
      })
      .catch(() => {});
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/finance/daily-reports"
          className="text-slate-500 hover:text-slate-300 transition-colors"
          aria-label="Back to daily reports"
        >
          ←
        </Link>
        <div className="flex-1 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl text-slate-100">Daily Sales Report</h1>
            <p className="text-sm text-slate-400 mt-0.5 font-mono">
              {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full border ${
              isReconciled
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            }`}
          >
            {isReconciled ? 'Reconciled' : 'Draft'}
          </span>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div
          className="rounded-xl p-6 space-y-4 animate-pulse"
          style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
        >
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex-1 h-8 bg-slate-800 rounded-full" />
            ))}
          </div>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-10 bg-slate-800/60 rounded-lg" />
          ))}
        </div>
      )}

      {/* Content */}
      {!loading && (
        isReconciled && reportData
          ? <ReconciledSummary data={reportData} date={date} />
          : (
            <DSRWizard
              date={date}
              initialData={reportData ?? undefined}
              onComplete={handleComplete}
            />
          )
      )}
    </div>
  );
}

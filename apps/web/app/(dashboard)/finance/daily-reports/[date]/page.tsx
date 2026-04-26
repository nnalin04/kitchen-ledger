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
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <span className="text-2xl">✅</span>
        <div>
          <p className="font-semibold text-green-800">Report Reconciled</p>
          <p className="text-sm text-green-600">Daily sales report for {date} is finalised.</p>
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => (
              <tr
                key={row.label}
                className={row.highlight ? 'bg-blue-50' : ''}
              >
                <td className="px-5 py-3 text-gray-500">{row.label}</td>
                <td
                  className={`px-5 py-3 text-right font-semibold tabular-nums ${
                    row.highlight ? 'text-blue-800' : 'text-gray-900'
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
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 mb-1">Variance Explanation</p>
          <p className="text-sm text-amber-800">{data.variance_explanation}</p>
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
        // 404 = no report yet — show wizard in empty state
        setReportData(null);
        setIsReconciled(false);
      })
      .finally(() => setLoading(false));
  }, [date]);

  const handleComplete = () => {
    router.refresh();
    // Re-fetch to show reconciled view
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
          className="text-gray-400 hover:text-gray-700 transition-colors"
          aria-label="Back to daily reports"
        >
          ←
        </Link>
        <div className="flex-1 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Daily Sales Report</h1>
            <p className="text-sm text-gray-500 mt-0.5">
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
                ? 'bg-green-100 text-green-700 border-green-200'
                : 'bg-amber-100 text-amber-700 border-amber-200'
            }`}
          >
            {isReconciled ? 'Reconciled' : 'Draft'}
          </span>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white rounded-xl border p-6 space-y-4 animate-pulse">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex-1 h-8 bg-gray-200 rounded-full" />
            ))}
          </div>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg" />
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

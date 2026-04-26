'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { apiClient } from '@/lib/api/client';
import { useRealtimeDsr } from '@/hooks/use-realtime';
import { useAuthStore } from '@/stores/auth.store';

const fetcher = (url: string) => apiClient.get(url).then(r => r.data.data);

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value?: number | string;
  prefix?: string;
  suffix?: string;
  benchmarkStatus?: 'good' | 'warning' | 'danger' | 'neutral';
  isLoading?: boolean;
  subtext?: string;
}

function KPICard({
  label,
  value,
  prefix = '',
  suffix = '',
  benchmarkStatus = 'neutral',
  isLoading,
  subtext,
}: KPICardProps) {
  const borderColors = {
    good: 'border-l-green-400',
    warning: 'border-l-yellow-400',
    danger: 'border-l-red-400',
    neutral: 'border-l-gray-200',
  };

  if (isLoading) {
    return (
      <div
        className={`bg-white rounded-xl border border-l-4 ${borderColors[benchmarkStatus]} p-5 animate-pulse`}
      >
        <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
        <div className="h-7 bg-gray-200 rounded w-3/4" />
      </div>
    );
  }

  const formatted =
    typeof value === 'number'
      ? value.toLocaleString('en-IN', { maximumFractionDigits: 1 })
      : value ?? '—';

  return (
    <div
      className={`bg-white rounded-xl border border-l-4 ${borderColors[benchmarkStatus]} p-5`}
    >
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">
        {prefix}
        {formatted}
        {suffix}
      </p>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
  );
}

// ── Quick-nav card ────────────────────────────────────────────────────────────

interface NavCardProps {
  href: string;
  title: string;
  description: string;
  icon: string;
}

function NavCard({ href, title, description, icon }: NavCardProps) {
  return (
    <Link
      href={href}
      className="bg-white rounded-xl border p-5 hover:border-blue-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
            {title}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancePage() {
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
      <div className="flex items-center justify-between">
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
        <Link
          href={`/finance/daily-reports/${today}`}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Today&apos;s DSR
        </Link>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          label="Net Sales (7 days)"
          value={kpis?.netSales7Day}
          prefix="₹"
          isLoading={isLoading}
          subtext="Rolling 7-day total"
        />
        <KPICard
          label="Food Cost %"
          value={kpis?.foodCostPercent}
          suffix="%"
          benchmarkStatus={fcStatus(kpis?.foodCostPercent)}
          isLoading={isLoading}
          subtext="Benchmark ≤ 35%"
        />
        <KPICard
          label="Outstanding AP"
          value={kpis?.outstandingAP}
          prefix="₹"
          benchmarkStatus={apStatus(kpis?.outstandingAP)}
          isLoading={isLoading}
          subtext="Unpaid vendor bills"
        />
      </div>

      {/* Quick navigation */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Sections
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NavCard
            href={`/finance/daily-reports/${today}`}
            icon="📋"
            title="Daily Sales Report"
            description="Enter & reconcile today's sales"
          />
          <NavCard
            href="/finance/expenses"
            icon="🧾"
            title="Expenses"
            description="Log and track all expenses"
          />
          <NavCard
            href="/finance/reports"
            icon="📊"
            title="P&L Report"
            description="Profit & loss by date range"
          />
          <NavCard
            href="/finance/ap"
            icon="💳"
            title="Accounts Payable"
            description="Vendor aging & payments"
          />
        </div>
      </div>

      {/* Recent DSR hint */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-800">
            Have you filed today&apos;s sales report?
          </p>
          <p className="text-xs text-blue-600 mt-0.5">
            It takes less than 2 minutes with the 4-step wizard.
          </p>
        </div>
        <Link
          href={`/finance/daily-reports/${today}`}
          className="text-sm font-semibold text-blue-700 hover:text-blue-900 transition-colors whitespace-nowrap"
        >
          Start now →
        </Link>
      </div>
    </div>
  );
}

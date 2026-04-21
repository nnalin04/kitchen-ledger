'use client';

import { useFinanceDashboard } from '@/hooks/use-finance';
import { useInventoryAlerts } from '@/hooks/use-inventory';

// ── Helper functions ──────────────────────────────────────────────────────────

function pctChange(current?: number, previous?: number): number | undefined {
  if (!current || !previous) return undefined;
  return ((current - previous) / previous) * 100;
}

function fcStatus(pct?: number): 'good' | 'warning' | 'danger' | 'neutral' {
  if (!pct) return 'neutral';
  if (pct <= 35) return 'good';
  if (pct <= 40) return 'warning';
  return 'danger';
}

function lcStatus(pct?: number): 'good' | 'warning' | 'danger' | 'neutral' {
  if (!pct) return 'neutral';
  if (pct <= 35) return 'good';
  if (pct <= 40) return 'warning';
  return 'danger';
}

function cashStatus(amount?: number): 'good' | 'warning' | 'danger' | 'neutral' {
  if (amount === undefined) return 'neutral';
  if (Math.abs(amount) <= 100) return 'good';
  if (Math.abs(amount) <= 500) return 'warning';
  return 'danger';
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value?: number;
  prefix?: string;
  suffix?: string;
  change?: number;
  benchmarkStatus?: 'good' | 'warning' | 'danger' | 'neutral';
  isLoading?: boolean;
}

function KPICard({
  label,
  value,
  prefix = '',
  suffix = '',
  change,
  benchmarkStatus = 'neutral',
  isLoading,
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
        className={`bg-white rounded-xl border border-l-4 ${borderColors[benchmarkStatus]} p-4 animate-pulse`}
      >
        <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
        <div className="h-6 bg-gray-200 rounded w-3/4" />
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl border border-l-4 ${borderColors[benchmarkStatus]} p-4`}
    >
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">
        {prefix}
        {typeof value === 'number'
          ? value.toLocaleString('en-IN', { maximumFractionDigits: 1 })
          : '—'}
        {suffix}
      </p>
      {change !== undefined && (
        <p className={`text-xs mt-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs last week
        </p>
      )}
    </div>
  );
}

interface LowStockItem {
  id: string;
  name: string;
  currentStock: number;
  parLevel: number;
  countUnit: string;
}

function LowStockWidget({ items }: { items: LowStockItem[] }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">⚠️ Low Stock</h3>
        <a href="/inventory" className="text-xs text-blue-600 hover:underline">
          View all
        </a>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">All items above PAR level ✓</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 5).map((item) => (
            <li key={item.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{item.name}</span>
              <span className="text-red-600 font-medium">
                {item.currentStock} {item.countUnit}{' '}
                <span className="text-gray-400">(PAR: {item.parLevel})</span>
              </span>
            </li>
          ))}
          {items.length > 5 && (
            <li className="text-xs text-gray-400">+{items.length - 5} more items</li>
          )}
        </ul>
      )}
    </div>
  );
}

interface ExpiringItem {
  id: string;
  name: string;
  expiryDate: string;
  currentStock: number;
  countUnit: string;
}

function ExpiringItemsWidget({ items }: { items: ExpiringItem[] }) {
  const today = new Date();

  function daysUntilExpiry(dateStr: string): number {
    const expiry = new Date(dateStr);
    const diff = expiry.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function expiryLabel(days: number): string {
    if (days < 0) return 'Expired';
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Expires tomorrow';
    return `Expires in ${days}d`;
  }

  function expiryColor(days: number): string {
    if (days <= 0) return 'text-red-600';
    if (days <= 2) return 'text-orange-500';
    return 'text-yellow-600';
  }

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">🗓️ Expiring Soon</h3>
        <a href="/inventory" className="text-xs text-blue-600 hover:underline">
          View all
        </a>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No items expiring in the next 3 days ✓</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 5).map((item) => {
            const days = daysUntilExpiry(item.expiryDate);
            return (
              <li key={item.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{item.name}</span>
                <span className={`font-medium ${expiryColor(days)}`}>
                  {expiryLabel(days)}{' '}
                  <span className="text-gray-400">
                    ({item.currentStock} {item.countUnit})
                  </span>
                </span>
              </li>
            );
          })}
          {items.length > 5 && (
            <li className="text-xs text-gray-400">+{items.length - 5} more items</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: kpis, isLoading: kpisLoading } = useFinanceDashboard();
  const { data: alerts } = useInventoryAlerts();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Good morning 👋</h1>
        <p className="text-sm text-gray-500">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* KPI Row 1 — Revenue */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Yesterday's Sales"
          value={kpis?.netSalesYesterday}
          prefix="₹"
          change={pctChange(kpis?.netSalesYesterday, kpis?.netSalesLastWeekSameDay)}
          isLoading={kpisLoading}
        />
        <KPICard
          label="Cash Over/Short"
          value={kpis?.cashOverShort}
          prefix="₹"
          benchmarkStatus={cashStatus(kpis?.cashOverShort)}
          isLoading={kpisLoading}
        />
        <KPICard
          label="Guest Count"
          value={kpis?.guestCount}
          isLoading={kpisLoading}
        />
        <KPICard
          label="Avg Check"
          value={kpis?.avgCheckSize}
          prefix="₹"
          isLoading={kpisLoading}
        />
      </div>

      {/* KPI Row 2 — Benchmarks */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Food Cost %"
          value={kpis?.foodCostPercent}
          suffix="%"
          benchmarkStatus={fcStatus(kpis?.foodCostPercent)}
          isLoading={kpisLoading}
        />
        <KPICard
          label="Labor Cost %"
          value={kpis?.laborCostPercent}
          suffix="%"
          benchmarkStatus={lcStatus(kpis?.laborCostPercent)}
          isLoading={kpisLoading}
        />
        <KPICard
          label="SPLH"
          value={kpis?.splh}
          prefix="₹"
          isLoading={kpisLoading}
        />
        {/* Placeholder — table turnover not yet wired */}
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            Table Turnover
          </p>
          <p className="text-2xl font-bold mt-1">—</p>
        </div>
      </div>

      {/* Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LowStockWidget items={alerts?.lowStock ?? []} />
        <ExpiringItemsWidget items={alerts?.expiring ?? []} />
      </div>
    </div>
  );
}

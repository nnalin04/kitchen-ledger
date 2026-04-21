import React from 'react';
import { cn } from '../utils';

export interface KPICardProps {
  label: string;
  value: string | number;
  change?: number;
  benchmarkStatus?: 'good' | 'warning' | 'danger' | 'neutral';
  prefix?: string;
  suffix?: string;
  isLoading?: boolean;
}

const borderColorMap: Record<string, string> = {
  good: 'border-l-green-500',
  warning: 'border-l-yellow-500',
  danger: 'border-l-red-500',
  neutral: 'border-l-gray-300',
};

const changeColorMap = (change: number) =>
  change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500';

const ChangeArrow = ({ change }: { change: number }) => {
  if (change === 0) return null;
  return (
    <span aria-hidden="true" className={cn('inline-block text-sm font-medium', changeColorMap(change))}>
      {change > 0 ? '▲' : '▼'}&nbsp;{Math.abs(change).toFixed(1)}%
    </span>
  );
};

const SkeletonPulse = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded bg-gray-200', className)} />
);

export function KPICard({
  label,
  value,
  change,
  benchmarkStatus = 'neutral',
  prefix,
  suffix,
  isLoading = false,
}: KPICardProps) {
  const borderColor = borderColorMap[benchmarkStatus] ?? borderColorMap.neutral;

  if (isLoading) {
    return (
      <div
        className={cn(
          'rounded-lg border border-gray-200 bg-white p-4 shadow-sm border-l-4',
          borderColor
        )}
        aria-busy="true"
        aria-label={`Loading ${label}`}
      >
        <SkeletonPulse className="mb-2 h-4 w-24" />
        <SkeletonPulse className="mb-2 h-8 w-32" />
        <SkeletonPulse className="h-4 w-16" />
      </div>
    );
  }

  const formattedValue =
    typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white p-4 shadow-sm border-l-4',
        borderColor
      )}
    >
      <p className="text-sm font-medium text-gray-500 truncate">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {prefix && <span className="text-lg font-semibold text-gray-700">{prefix}</span>}
        {formattedValue}
        {suffix && <span className="text-lg font-semibold text-gray-700">{suffix}</span>}
      </p>
      {change !== undefined && (
        <div className="mt-1">
          <ChangeArrow change={change} />
          {change === 0 && (
            <span className="text-sm text-gray-500">No change</span>
          )}
        </div>
      )}
    </div>
  );
}

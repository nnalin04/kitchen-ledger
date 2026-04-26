'use client';

interface KPICardProps {
  label: string;
  value: string;
  change?: number;
  changeLabel?: string;
  status?: 'good' | 'warn' | 'bad';
}

const borderColors: Record<NonNullable<KPICardProps['status']>, string> = {
  good: 'border-l-green-400',
  warn: 'border-l-yellow-400',
  bad: 'border-l-red-400',
};

const changeColors: Record<NonNullable<KPICardProps['status']>, string> = {
  good: 'text-green-600',
  warn: 'text-yellow-600',
  bad: 'text-red-600',
};

export function KPICard({
  label,
  value,
  change,
  changeLabel,
  status,
}: KPICardProps) {
  const borderClass = status ? borderColors[status] : 'border-l-gray-200';
  const changeColorClass =
    change !== undefined
      ? change >= 0
        ? 'text-green-600'
        : 'text-red-600'
      : status
      ? changeColors[status]
      : 'text-gray-500';

  return (
    <div
      className={`bg-white rounded-xl border border-l-4 ${borderClass} p-4 flex flex-col gap-1`}
    >
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide leading-none">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      {change !== undefined && (
        <p className={`text-xs font-medium ${changeColorClass} flex items-center gap-0.5`}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
          {changeLabel && (
            <span className="text-gray-400 font-normal ml-1">{changeLabel}</span>
          )}
        </p>
      )}
    </div>
  );
}

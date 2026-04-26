interface BenchmarkBadgeProps {
  status: 'good' | 'warn' | 'bad';
  label?: string;
}

const badgeStyles: Record<BenchmarkBadgeProps['status'], string> = {
  good: 'bg-green-100 text-green-700 border-green-200',
  warn: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  bad: 'bg-red-100 text-red-700 border-red-200',
};

const dotStyles: Record<BenchmarkBadgeProps['status'], string> = {
  good: 'bg-green-500',
  warn: 'bg-yellow-500',
  bad: 'bg-red-500',
};

const defaultLabels: Record<BenchmarkBadgeProps['status'], string> = {
  good: 'Good',
  warn: 'Warning',
  bad: 'Critical',
};

export function BenchmarkBadge({ status, label }: BenchmarkBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeStyles[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[status]}`} />
      {label ?? defaultLabels[status]}
    </span>
  );
}

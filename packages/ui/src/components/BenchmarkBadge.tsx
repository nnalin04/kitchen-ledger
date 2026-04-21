import React from 'react';
import { cn } from '../utils';

export interface BenchmarkBadgeProps {
  status: 'good' | 'warning' | 'danger' | 'neutral';
  label?: string;
  size?: 'sm' | 'md';
}

const statusStyles: Record<BenchmarkBadgeProps['status'], string> = {
  good: 'bg-green-100 text-green-800 border border-green-200',
  warning: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  danger: 'bg-red-100 text-red-800 border border-red-200',
  neutral: 'bg-gray-100 text-gray-700 border border-gray-200',
};

const sizeStyles: Record<NonNullable<BenchmarkBadgeProps['size']>, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
};

const statusDotColor: Record<BenchmarkBadgeProps['status'], string> = {
  good: 'bg-green-500',
  warning: 'bg-yellow-500',
  danger: 'bg-red-500',
  neutral: 'bg-gray-400',
};

export function BenchmarkBadge({
  status,
  label,
  size = 'md',
}: BenchmarkBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        statusStyles[status],
        sizeStyles[size]
      )}
      role="status"
      aria-label={label ? `${status}: ${label}` : status}
    >
      <span
        className={cn('rounded-full flex-shrink-0', statusDotColor[status], {
          'h-1.5 w-1.5': size === 'sm',
          'h-2 w-2': size === 'md',
        })}
        aria-hidden="true"
      />
      {label ?? status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

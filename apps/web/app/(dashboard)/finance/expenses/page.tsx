'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { motion } from 'motion/react';
import { financeApi } from '@/lib/api/finance.api';
import { ExpenseForm } from '@/components/finance/ExpenseForm';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CATEGORIES = ['Food', 'Beverage', 'Labor', 'Utilities', 'Rent', 'Marketing', 'Other'] as const;

interface Expense {
  id: string;
  date: string;
  description: string;
  vendor_name?: string;
  category: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
  payment_method?: string;
  receipt_url?: string;
}

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  overdue: 'bg-rose-100 text-rose-700',
};

const STATUS_DOT: Record<string, string> = {
  paid: 'bg-emerald-500',
  pending: 'bg-amber-400',
  overdue: 'bg-rose-500',
};

function fmt(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

interface FilterState {
  from: string;
  to: string;
  category: string;
  search: string;
}

function buildSWRKey(filters: FilterState, page: number) {
  return `finance/expenses?page=${page}&from=${filters.from}&to=${filters.to}&category=${filters.category}&search=${filters.search}`;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

export default function ExpensesPage() {
  const [filters, setFilters] = useState<FilterState>({ from: '', to: '', category: '', search: '' });
  const [page] = useState(1);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);

  const swrKey = buildSWRKey(filters, page);

  const { data, isLoading, error } = useSWR(swrKey, () => {
    const params: Record<string, string | number> = { page, size: 25 };
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.category) params.category = filters.category;
    return financeApi.expenses.list(params);
  });

  const expenses: Expense[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* ExpenseForm sheet (full-featured with OCR + vendor search) */}
      {expenseFormOpen && (
        <ExpenseForm
          onClose={() => setExpenseFormOpen(false)}
          onSaved={() => {
            setExpenseFormOpen(false);
            mutate(swrKey);
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and manage all restaurant expenses</p>
        </div>
        <motion.button
          onClick={() => setExpenseFormOpen(true)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow-md transition-shadow"
        >
          + Add Expense
        </motion.button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <Select
              value={filters.category || 'all'}
              onValueChange={(v: string) => setFilters(f => ({ ...f, category: v === 'all' ? '' : v }))}
            >
              <SelectTrigger className="w-full h-9 text-sm">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              placeholder="Description or vendor…"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b">
              <tr>
                {['Date', 'Description', 'Vendor', 'Category', 'Amount', 'Status', 'Receipt'].map(h => (
                  <th key={h} className="text-left px-4 py-3">
                    <div className="h-3 bg-gray-200 rounded w-16 animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-20 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-40 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-24 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-16 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-20 ml-auto animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-5 bg-gray-100 rounded-full w-16 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-5 bg-gray-100 rounded w-8 mx-auto animate-pulse" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-red-600">Failed to load expenses</p>}

      {/* Table */}
      {!isLoading && !error && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 backdrop-blur-sm border-b sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((exp, index) => (
                <motion.tr
                  key={exp.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.035, duration: 0.2 }}
                  className="group hover:bg-blue-50/40 transition-colors border-l-2 border-l-transparent hover:border-l-blue-500"
                >
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(exp.date + 'T00:00:00').toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{exp.description}</td>
                  <td className="px-4 py-3 text-gray-600">{exp.vendor_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{exp.category}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                    ₹{fmt(exp.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        STATUS_BADGE[exp.status] ?? 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${
                          STATUS_DOT[exp.status] ?? 'bg-gray-400'
                        }`}
                      />
                      {exp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {exp.receipt_url ? (
                      <a
                        href={exp.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block"
                      >
                        <motion.div
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          className="w-8 h-8 bg-gray-100 rounded border flex items-center justify-center text-xs text-gray-500 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                            />
                          </svg>
                        </motion.div>
                      </a>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>

          {expenses.length === 0 && (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
              <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"
                />
              </svg>
              <p className="font-medium text-sm">No expenses found</p>
              <p className="text-xs">Try adjusting your filters or add a new expense</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

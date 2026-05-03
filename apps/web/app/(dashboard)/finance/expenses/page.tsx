'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { motion, useReducedMotion } from 'motion/react';
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
  paid: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  overdue: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

const STATUS_DOT: Record<string, string> = {
  paid: 'bg-emerald-400',
  pending: 'bg-amber-400',
  overdue: 'bg-red-400',
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

const darkInputClass =
  'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-colors';

export default function ExpensesPage() {
  const shouldReduce = useReducedMotion();
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
      {/* ExpenseForm sheet */}
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
          <h1 className="font-serif text-2xl text-slate-100">Expenses</h1>
          <p className="text-sm text-slate-400 mt-0.5">Track and manage all restaurant expenses</p>
        </div>
        <motion.button
          onClick={() => setExpenseFormOpen(true)}
          whileHover={shouldReduce ? {} : { scale: 1.02, boxShadow: '0 4px 12px rgba(37,99,235,0.35)' }}
          whileTap={shouldReduce ? {} : { scale: 0.97 }}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-lg text-sm font-medium transition-all"
        >
          + Add Expense
        </motion.button>
      </div>

      {/* Filters */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold tracking-wide text-slate-500 uppercase mb-1.5">From</label>
            <input
              type="date"
              value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
              className={darkInputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wide text-slate-500 uppercase mb-1.5">To</label>
            <input
              type="date"
              value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
              className={darkInputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wide text-slate-500 uppercase mb-1.5">Category</label>
            <Select
              value={filters.category || 'all'}
              onValueChange={(v: string) => setFilters(f => ({ ...f, category: v === 'all' ? '' : v }))}
            >
              <SelectTrigger className="w-full h-9 text-sm bg-slate-800 border-slate-700 text-slate-100 focus:ring-blue-500/40 focus:border-blue-500/60">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                <SelectItem value="all" className="focus:bg-slate-800">All Categories</SelectItem>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c} className="focus:bg-slate-800">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wide text-slate-500 uppercase mb-1.5">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              placeholder="Description or vendor…"
              className={darkInputClass}
            />
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
        >
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800">
              <tr>
                {['Date', 'Description', 'Vendor', 'Category', 'Amount', 'Status', 'Receipt'].map(h => (
                  <th key={h} className="text-left px-4 py-3">
                    <div className="h-3 bg-slate-800 rounded w-16 animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800/60 rounded w-20 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800/60 rounded w-40 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800/60 rounded w-24 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800/60 rounded w-16 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800/60 rounded w-20 ml-auto animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-5 bg-slate-800/60 rounded-full w-16 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-5 bg-slate-800/60 rounded w-8 mx-auto animate-pulse" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-red-400">Failed to load expenses</p>}

      {/* Table */}
      {!isLoading && !error && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
        >
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 sticky top-0 z-10" style={{ background: 'rgba(10,12,25,0.95)' }}>
              <tr>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Date</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Description</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Vendor</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Category</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Amount</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="text-center px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {expenses.map((exp, index) => (
                <motion.tr
                  key={exp.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.035, duration: 0.2 }}
                  className="group hover:bg-slate-800/40 transition-colors border-l-2 border-l-transparent hover:border-l-blue-500"
                >
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap font-mono text-xs">
                    {new Date(exp.date + 'T00:00:00').toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-200">{exp.description}</td>
                  <td className="px-4 py-3 text-slate-400">{exp.vendor_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{exp.category}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums font-mono text-slate-100">
                    ₹{fmt(exp.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        STATUS_BADGE[exp.status] ?? 'bg-slate-700/50 text-slate-400 border border-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${
                          STATUS_DOT[exp.status] ?? 'bg-slate-500'
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
                          className="w-8 h-8 bg-slate-800 rounded border border-slate-700 flex items-center justify-center text-xs text-slate-500 hover:bg-blue-500/15 hover:border-blue-500/40 hover:text-blue-400 transition-colors"
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
                      <span className="text-slate-700 text-xs">—</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>

          {expenses.length === 0 && (
            <div className="py-16 flex flex-col items-center gap-3 text-slate-500">
              <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"
                />
              </svg>
              <p className="font-medium text-sm text-slate-400">No expenses found</p>
              <p className="text-xs text-slate-600">Try adjusting your filters or add a new expense</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

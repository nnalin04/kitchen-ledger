'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import useSWR from 'swr';
import { inventoryApi } from '@/lib/api/inventory.api';

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow({ index }: { index: number }) {
  const shouldReduce = useReducedMotion();

  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: 6 }).map((_, j) => (
        <td key={j} className="px-4 py-3">
          <motion.div
            className="h-4 bg-gray-100 rounded"
            animate={shouldReduce ? {} : { opacity: [0.4, 0.9, 0.4] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: index * 0.08 + j * 0.06,
            }}
            style={{ width: j === 0 ? '70%' : j === 5 ? '50%' : '60%' }}
          />
        </td>
      ))}
    </tr>
  );
}

// ── ABC filter button ─────────────────────────────────────────────────────────

interface FilterButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterButton({ label, active, onClick }: FilterButtonProps) {
  const shouldReduce = useReducedMotion();

  return (
    <button
      onClick={onClick}
      className={`relative px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {active && (
        <motion.span
          layoutId="abc-filter-pill"
          className="absolute inset-0 bg-blue-600"
          transition={
            shouldReduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }
          }
          style={{ zIndex: 0 }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}

// ── Inventory row ─────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  name: string;
  abcCategory?: string;
  currentStock: number;
  parLevel?: number;
  countUnit: string;
  storageLocation?: string;
  avgCost?: number;
}

interface InventoryRowProps {
  item: InventoryItem;
  index: number;
}

function InventoryRow({ item, index }: InventoryRowProps) {
  const shouldReduce = useReducedMotion();
  const isLow = item.currentStock <= (item.parLevel ?? 0);

  return (
    <motion.tr
      className={`border-b border-gray-100 cursor-pointer ${isLow ? 'bg-red-50' : ''}`}
      initial={{ opacity: 0, y: shouldReduce ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: index * 0.04, duration: 0.22, ease: 'easeOut' }}
      whileHover={
        shouldReduce
          ? {}
          : { backgroundColor: isLow ? 'rgb(254,226,226)' : 'rgb(249,250,251)' }
      }
    >
      <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
            item.abcCategory === 'A'
              ? 'bg-red-100 text-red-700'
              : item.abcCategory === 'B'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {item.abcCategory}
        </span>
      </td>
      <td
        className={`px-4 py-3 text-right font-medium ${
          isLow ? 'text-red-600' : 'text-gray-900'
        }`}
      >
        {item.currentStock} {item.countUnit}
      </td>
      <td className="px-4 py-3 text-right text-gray-500">{item.parLevel ?? '—'}</td>
      <td className="px-4 py-3 text-gray-500">{item.storageLocation ?? '—'}</td>
      <td className="px-4 py-3 text-right text-gray-700">
        ₹{item.avgCost?.toFixed(2) ?? '—'}
      </td>
    </motion.tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const shouldReduce = useReducedMotion();
  const [search, setSearch] = useState('');
  const [abcFilter, setAbcFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const { data, isLoading } = useSWR(
    ['inventory/items', search, abcFilter, lowStockOnly],
    () =>
      inventoryApi.items
        .list({
          search: search || undefined,
          abcCategory: abcFilter || undefined,
          lowStockOnly: lowStockOnly || undefined,
        })
        .then((r: { data?: InventoryItem[] }) => r.data ?? [])
  );

  const items = (data ?? []) as InventoryItem[];

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: shouldReduce ? 0 : -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
        <motion.button
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          whileHover={
            shouldReduce
              ? {}
              : { scale: 1.02, boxShadow: '0 4px 12px rgba(37,99,235,0.35)' }
          }
          whileTap={shouldReduce ? {} : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 24 }}
        >
          + Add Item
        </motion.button>
      </motion.div>

      {/* Filters */}
      <motion.div
        className="flex gap-3 flex-wrap items-center"
        initial={{ opacity: 0, y: shouldReduce ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08, ease: 'easeOut' }}
      >
        {/* Search bar with animated focus ring */}
        <motion.div
          className="relative"
          animate={
            shouldReduce
              ? {}
              : {
                  boxShadow: searchFocused
                    ? '0 0 0 3px rgba(59,130,246,0.25)'
                    : '0 0 0 0px rgba(59,130,246,0)',
                }
          }
          transition={{ duration: 0.15 }}
          style={{ borderRadius: '0.5rem' }}
        >
          <input
            type="search"
            placeholder="Search items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </motion.div>

        {/* ABC filter — animated sliding pill */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          {(['', 'A', 'B', 'C'] as const).map(cat => (
            <FilterButton
              key={cat}
              label={cat || 'All'}
              active={abcFilter === cat}
              onClick={() => setAbcFilter(cat)}
            />
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={e => setLowStockOnly(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Low Stock Only
        </label>
      </motion.div>

      {/* Table */}
      <motion.div
        className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
        initial={{ opacity: 0, y: shouldReduce ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.14, ease: 'easeOut' }}
      >
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ABC</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Stock</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">PAR</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Avg Cost</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} index={i} />)
              : items.map((item, rowIndex) => (
                  <InventoryRow key={item.id} item={item} index={rowIndex} />
                ))}
          </tbody>
        </table>

        <AnimatePresence>
          {!isLoading && items.length === 0 && (
            <motion.div
              className="text-center py-12 text-gray-400"
              initial={{ opacity: 0, scale: shouldReduce ? 1 : 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: shouldReduce ? 1 : 0.97 }}
              transition={{ duration: 0.25 }}
            >
              <p className="text-lg font-medium">No items found</p>
              <p className="text-sm mt-1">Add your first inventory item to get started</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

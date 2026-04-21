'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';

const fetcher = (url: string) => apiClient.get(url).then(r => r.data.data);

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [abcFilter, setAbcFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (abcFilter) params.set('abcCategory', abcFilter);
  if (lowStockOnly) params.set('lowStockOnly', 'true');

  const { data, isLoading } = useSWR(
    `/api/inventory/items?${params.toString()}`,
    fetcher
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          + Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="search"
          placeholder="Search items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          {(['', 'A', 'B', 'C'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setAbcFilter(cat)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                abcFilter === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {cat || 'All'}
            </button>
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
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
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              : (data ?? []).map((item: any) => {
                  const isLow = item.currentStock <= (item.parLevel ?? 0);
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                        isLow ? 'bg-red-50' : ''
                      }`}
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
                      <td className="px-4 py-3 text-right text-gray-500">
                        {item.parLevel ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.storageLocation ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        ₹{item.avgCost?.toFixed(2) ?? '—'}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!isLoading && (data ?? []).length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No items found</p>
            <p className="text-sm mt-1">Add your first inventory item to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}

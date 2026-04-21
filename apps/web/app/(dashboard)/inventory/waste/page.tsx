'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { inventoryApi } from '@/lib/api/inventory.api';

const REASONS = ['Spoilage', 'Over-preparation', 'Dropped', 'Expired', 'Trimming', 'Other'];

export default function WastePage() {
  const { data: wasteData, isLoading, mutate } = useSWR('inventory/waste', () =>
    inventoryApi.waste.list().then(r => r.data ?? [])
  );
  const { data: itemsData } = useSWR('inventory/items-all', () =>
    inventoryApi.items.list({ size: 200 }).then(r => r.data ?? [])
  );

  const [form, setForm] = useState({
    itemId: '',
    reason: '',
    quantity: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const items: any[] = itemsData ?? [];
  const entries: any[] = wasteData ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.itemId || !form.reason || !form.quantity) return;
    setSubmitting(true);
    try {
      await inventoryApi.waste.log({
        item_id: form.itemId,
        reason: form.reason,
        quantity: parseFloat(form.quantity),
        notes: form.notes,
      });
      setForm({ itemId: '', reason: '', quantity: '', notes: '' });
      mutate();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Waste Log</h1>

      {/* Quick log form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Log Waste</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Item</label>
            <select
              value={form.itemId}
              onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))}
              required
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select item…</option>
              {items.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Reason</label>
            <select
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              required
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select reason…</option>
              {REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Quantity</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
              placeholder="0.00"
              required
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-40">
            <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Add notes…"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Logging…' : 'Log Waste'}
          </button>
        </form>
      </div>

      {/* Waste entries table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Item</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Quantity</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Est. Cost</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Logged By</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              : entries.map((entry: any) => (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(entry.loggedAt ?? entry.created_at).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {entry.itemName ?? entry.item?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {entry.quantity} {entry.unit ?? ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        {entry.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {entry.estimatedCost != null ? `₹${entry.estimatedCost.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{entry.loggedBy ?? '—'}</td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!isLoading && entries.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No waste entries yet</p>
            <p className="text-sm mt-1">Log your first waste entry above</p>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { inventoryApi } from '@/lib/api/inventory.api';

const STATUS_BADGE: Record<string, string> = {
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-yellow-100 text-yellow-700',
  VERIFIED: 'bg-green-100 text-green-700',
};

export default function CountsPage() {
  const { data: countsData, isLoading, mutate } = useSWR('inventory/counts', () =>
    inventoryApi.counts.list().then(r => r.data ?? [])
  );

  const [showModal, setShowModal] = useState(false);
  const [countType, setCountType] = useState<'FULL' | 'CYCLE'>('FULL');
  const [abcFilter, setAbcFilter] = useState('A');
  const [starting, setStarting] = useState(false);

  const counts: any[] = countsData ?? [];

  async function handleStart() {
    setStarting(true);
    try {
      await inventoryApi.counts.start({
        type: countType,
        abc_filter: countType === 'CYCLE' ? abcFilter : undefined,
      });
      setShowModal(false);
      mutate();
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Stock Counts</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Start New Count
        </button>
      </div>

      {/* Count sessions table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Session ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Started</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Started By</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              : counts.map((count: any) => (
                  <tr key={count.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-700">
                      {count.id?.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{count.type ?? 'FULL'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          STATUS_BADGE[count.status] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {count.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {count.startedAt
                        ? new Date(count.startedAt).toLocaleDateString('en-IN')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{count.startedBy ?? '—'}</td>
                    <td className="px-4 py-3">
                      {count.status === 'IN_PROGRESS' && (
                        <Link
                          href={`/inventory/counts/${count.id}`}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Continue →
                        </Link>
                      )}
                      {count.status === 'COMPLETED' && (
                        <Link
                          href={`/inventory/counts/${count.id}`}
                          className="text-xs text-green-600 hover:text-green-800 font-medium"
                        >
                          Verify →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!isLoading && counts.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No count sessions yet</p>
            <p className="text-sm mt-1">Start a new count to begin tracking inventory</p>
          </div>
        )}
      </div>

      {/* New count modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Start New Count</h2>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Count Type</label>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                {(['FULL', 'CYCLE'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setCountType(type)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      countType === type
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {countType === 'CYCLE' && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">ABC Category</label>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  {(['A', 'B', 'C'] as const).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setAbcFilter(cat)}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        abcFilter === cat
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStart}
                disabled={starting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {starting ? 'Starting…' : 'Start Count'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

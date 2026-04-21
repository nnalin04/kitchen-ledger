'use client';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { inventoryApi } from '@/lib/api/inventory.api';

export default function CountSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: sessionData, isLoading, mutate } = useSWR(
    id ? `inventory/counts/${id}` : null,
    () => inventoryApi.counts.list().then(r => (r.data ?? []).find((c: any) => c.id === id))
  );

  const session = sessionData as any;
  const items: any[] = session?.items ?? [];

  // Group items by storage location
  const grouped = items.reduce(
    (acc: Record<string, any[]>, item: any) => {
      const loc = item.storageLocation ?? 'Unassigned';
      if (!acc[loc]) acc[loc] = [];
      acc[loc].push(item);
      return acc;
    },
    {}
  );

  async function handleQtyChange(itemId: string, value: string) {
    const qty = parseFloat(value);
    if (isNaN(qty)) return;
    await inventoryApi.counts.updateItem(id, itemId, qty);
    mutate();
  }

  async function handleComplete() {
    await inventoryApi.counts.complete(id);
    mutate();
  }

  async function handleVerify() {
    await inventoryApi.counts.verify(id);
    router.push('/inventory/counts');
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-100 rounded w-64" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg font-medium">Count session not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Go back"
        >
          ←
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Count Session — {id?.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Type: {session.type ?? 'FULL'} &nbsp;·&nbsp; Status: {session.status}
          </p>
        </div>
      </div>

      {/* Items grouped by location */}
      {Object.entries(grouped).map(([location, locationItems]) => (
        <div key={location} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
            <p className="text-sm font-semibold text-gray-700">{location}</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2 font-medium text-gray-600">Item</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Expected</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Counted</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Variance</th>
              </tr>
            </thead>
            <tbody>
              {(locationItems as any[]).map((item: any) => {
                const variance =
                  item.countedQuantity != null
                    ? item.countedQuantity - (item.expectedQuantity ?? 0)
                    : null;
                return (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{item.itemName ?? item.name}</td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {item.expectedQuantity ?? '—'} {item.unit ?? ''}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={item.countedQuantity ?? ''}
                        onBlur={e => handleQtyChange(item.itemId ?? item.id, e.target.value)}
                        disabled={session.status === 'VERIFIED'}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        variance === null
                          ? 'text-gray-400'
                          : variance === 0
                          ? 'text-green-600'
                          : variance > 0
                          ? 'text-blue-600'
                          : 'text-red-600'
                      }`}
                    >
                      {variance === null
                        ? '—'
                        : `${variance > 0 ? '+' : ''}${variance.toFixed(2)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {items.length === 0 && (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
          <p className="text-lg font-medium">No items in this count session</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 justify-end">
        {session.status === 'IN_PROGRESS' && (
          <button
            onClick={handleComplete}
            className="px-5 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors"
          >
            Complete Count
          </button>
        )}
        {session.status === 'COMPLETED' && (
          <button
            onClick={handleVerify}
            className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Verify &amp; Apply
          </button>
        )}
      </div>
    </div>
  );
}

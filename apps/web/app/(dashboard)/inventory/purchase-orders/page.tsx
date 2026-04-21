'use client';
import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { inventoryApi } from '@/lib/api/inventory.api';

const STATUS_TABS = ['All', 'DRAFT', 'SENT', 'RECEIVED'] as const;

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENT: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

export default function PurchaseOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const { data: poData, isLoading } = useSWR(
    ['inventory/purchase-orders', statusFilter],
    () =>
      inventoryApi.purchaseOrders
        .list(statusFilter !== 'All' ? { status: statusFilter } : undefined)
        .then(r => r.data ?? [])
  );

  const { data: suggestionsData } = useSWR('inventory/po-suggestions', () =>
    inventoryApi.purchaseOrders.getSuggestions().then(r => r.data ?? [])
  );

  const orders: any[] = poData ?? [];
  const suggestions: any[] = suggestionsData ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
        <Link
          href="/inventory/purchase-orders/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Create PO
        </Link>
      </div>

      {/* Suggestions banner */}
      {suggestions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-amber-500 text-lg mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {suggestions.length} item{suggestions.length > 1 ? 's' : ''} below PAR level
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {suggestions.slice(0, 3).map((s: any) => s.itemName ?? s.name).join(', ')}
              {suggestions.length > 3 && ` and ${suggestions.length - 3} more`}
            </p>
            <Link
              href="/inventory/purchase-orders/new"
              className="mt-2 inline-block text-xs font-medium text-amber-700 underline hover:text-amber-900"
            >
              Create reorder PO
            </Link>
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === tab
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* PO table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">PO Number</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Supplier</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Order Date</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
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
              : orders.map((po: any) => (
                  <tr key={po.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-blue-600">
                      {po.poNumber ?? po.id?.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{po.supplierName ?? po.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          STATUS_BADGE[po.status] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {po.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {po.orderDate
                        ? new Date(po.orderDate).toLocaleDateString('en-IN')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      ₹{po.totalAmount?.toFixed(2) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {po.status === 'DRAFT' && (
                        <button
                          onClick={() => inventoryApi.purchaseOrders.send(po.id, 'email')}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Send
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!isLoading && orders.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No purchase orders</p>
            <p className="text-sm mt-1">Create your first PO to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}

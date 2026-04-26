'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'motion/react';
import { inventoryApi } from '@/lib/api/inventory.api';
import { Button } from '@/components/ui/button';

const statusStyles: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function ReceiptsPage() {
  const { data, isLoading } = useSWR('inventory/receipts', () =>
    inventoryApi.receipts.list().then(r => r.data ?? [])
  );

  const receipts: any[] = data ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Stock Receipts</h1>
        <Link href="/inventory/receipts/new">
          <Button>+ New Receipt</Button>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">PO Reference</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Supplier</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Items</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 animate-pulse">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            <AnimatePresence>
              {!isLoading &&
                receipts.map((receipt, i) => (
                  <motion.tr
                    key={receipt.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.04 }}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-gray-600">
                      {receipt.receivedAt
                        ? new Date(receipt.receivedAt).toLocaleDateString('en-IN')
                        : receipt.createdAt
                        ? new Date(receipt.createdAt).toLocaleDateString('en-IN')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {receipt.purchaseOrderId
                        ? <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">PO-{receipt.purchaseOrderId.slice(0, 8).toUpperCase()}</span>
                        : <span className="text-gray-400">Direct receipt</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {receipt.supplierName ?? receipt.supplier?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {receipt.items?.length ?? receipt.lineItems?.length ?? receipt.itemCount ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          statusStyles[receipt.status] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {receipt.status ?? 'PENDING'}
                      </span>
                    </td>
                  </motion.tr>
                ))}
            </AnimatePresence>
          </tbody>
        </table>
        {!isLoading && receipts.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No receipts yet</p>
            <p className="text-sm mt-1">Create your first stock receipt to start tracking deliveries</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

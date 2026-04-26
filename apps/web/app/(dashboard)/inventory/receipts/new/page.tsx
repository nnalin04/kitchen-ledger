'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import useSWR from 'swr';
import { motion } from 'motion/react';
import { inventoryApi } from '@/lib/api/inventory.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  purchaseOrderId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface LineItem {
  itemId: string;
  itemName: string;
  expectedQty: number | null;
  receivedQty: string;
  unitPrice: string;
}

export default function NewReceiptPage() {
  const router = useRouter();
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: posData } = useSWR('inventory/pos-sent', () =>
    inventoryApi.purchaseOrders.list({ status: 'SENT' }).then(r => r.data ?? [])
  );
  const openPOs: any[] = posData ?? [];

  const { register, handleSubmit, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { purchaseOrderId: '', invoiceNumber: '', invoiceDate: '', notes: '' },
  });

  const selectedPOId = watch('purchaseOrderId');

  useEffect(() => {
    if (!selectedPOId) {
      setLineItems([]);
      return;
    }
    const po = openPOs.find((p: any) => p.id === selectedPOId);
    if (!po) return;
    const items: LineItem[] = (po.items ?? po.lineItems ?? []).map((i: any) => ({
      itemId: i.itemId ?? i.item?.id ?? '',
      itemName: i.itemName ?? i.item?.name ?? 'Unknown',
      expectedQty: i.orderedQuantity ?? i.quantity ?? null,
      receivedQty: String(i.orderedQuantity ?? i.quantity ?? ''),
      unitPrice: String(i.unitPrice ?? ''),
    }));
    setLineItems(items);
  }, [selectedPOId, openPOs]);

  function updateLineItem(index: number, field: 'receivedQty' | 'unitPrice', value: string) {
    setLineItems(items =>
      items.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      await inventoryApi.receipts.create({
        purchaseOrderId: data.purchaseOrderId || undefined,
        invoiceNumber: data.invoiceNumber || undefined,
        invoiceDate: data.invoiceDate || undefined,
        notes: data.notes || undefined,
        items: lineItems.map(li => ({
          itemId: li.itemId,
          receivedQuantity: parseFloat(li.receivedQty) || 0,
          unitPrice: parseFloat(li.unitPrice) || 0,
        })),
      });
      router.push('/inventory/receipts');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create receipt');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 max-w-3xl"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-gray-600 transition-colors text-lg"
          aria-label="Go back"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold text-gray-900">New Stock Receipt</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Header fields */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Receipt Details</h2>

          <div className="space-y-2">
            <Label htmlFor="purchaseOrderId">Purchase Order (optional)</Label>
            <select
              id="purchaseOrderId"
              {...register('purchaseOrderId')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Direct receipt (no PO) —</option>
              {openPOs.map((po: any) => (
                <option key={po.id} value={po.id}>
                  PO-{po.id.slice(0, 8).toUpperCase()}
                  {po.supplierName ? ` · ${po.supplierName}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Invoice Number</Label>
              <Input id="invoiceNumber" {...register('invoiceNumber')} placeholder="INV-2024-001" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Invoice Date</Label>
              <Input id="invoiceDate" type="date" {...register('invoiceDate')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              {...register('notes')}
              rows={2}
              placeholder="Any notes about this delivery…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Line Items</h2>
          </div>

          {lineItems.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-sm">Select a PO above to auto-populate items, or items will be added post-confirmation.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Item</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Expected</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Received</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Unit Price (₹)</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => {
                    const received = parseFloat(item.receivedQty);
                    const expected = item.expectedQty;
                    const hasDiscrepancy =
                      expected !== null && !isNaN(received) && received !== expected;
                    return (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{item.itemName}</td>
                        <td className="px-4 py-2 text-right text-gray-500">
                          {item.expectedQty ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {hasDiscrepancy && (
                              <span className="text-amber-500 text-xs font-bold" title="Quantity differs from expected">
                                !
                              </span>
                            )}
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.receivedQty}
                              onChange={e => updateLineItem(i, 'receivedQty', e.target.value)}
                              className={`w-24 h-7 text-sm text-right ${hasDiscrepancy ? 'border-amber-400 focus:ring-amber-400' : ''}`}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unitPrice}
                            onChange={e => updateLineItem(i, 'unitPrice', e.target.value)}
                            className="w-28 h-7 text-sm text-right"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setLineItems(li => li.filter((_, idx) => idx !== i))}
                            className="text-red-400 hover:text-red-600 text-xs"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Creating…
              </span>
            ) : 'Create Receipt'}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}

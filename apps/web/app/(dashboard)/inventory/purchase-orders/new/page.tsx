'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { inventoryApi } from '@/lib/api/inventory.api';

interface LineItem {
  itemId: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
}

function emptyLine(): LineItem {
  return { itemId: '', itemName: '', quantity: '', unitPrice: '' };
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { data: suppliersData } = useSWR('inventory/suppliers', () =>
    inventoryApi.suppliers.list().then(r => r.data ?? [])
  );
  const { data: itemsData } = useSWR('inventory/items-all', () =>
    inventoryApi.items.list({ size: 200 }).then(r => r.data ?? [])
  );

  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const suppliers: any[] = suppliersData ?? [];
  const items: any[] = itemsData ?? [];

  function updateLine(index: number, field: keyof LineItem, value: string) {
    setLines(prev =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, [field]: value };
        if (field === 'itemId') {
          const found = items.find((it: any) => it.id === value);
          updated.itemName = found?.name ?? '';
        }
        return updated;
      })
    );
  }

  function addLine() {
    setLines(prev => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines(prev => prev.filter((_, i) => i !== index));
  }

  function lineTotal(line: LineItem): number {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unitPrice) || 0;
    return qty * price;
  }

  const grandTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  async function handleSave(sendNow: boolean) {
    if (!supplierId) return;
    setSaving(true);
    try {
      const payload = {
        supplier_id: supplierId,
        items: lines
          .filter(l => l.itemId && l.quantity)
          .map(l => ({
            item_id: l.itemId,
            quantity: parseFloat(l.quantity),
            unit_price: parseFloat(l.unitPrice) || 0,
          })),
        status: sendNow ? 'SENT' : 'DRAFT',
      };
      const res = await inventoryApi.purchaseOrders.create(payload);
      if (sendNow && res?.data?.id) {
        await inventoryApi.purchaseOrders.send(res.data.id, 'email');
      }
      router.push('/inventory/purchase-orders');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Go back"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold text-gray-900">New Purchase Order</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
        {/* Supplier selector */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Supplier</label>
          <select
            value={supplierId}
            onChange={e => setSupplierId(e.target.value)}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Line items */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Items</p>
          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <select
                  value={line.itemId}
                  onChange={e => updateLine(idx, 'itemId', e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select item…</option>
                  {items.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={line.quantity}
                  onChange={e => updateLine(idx, 'quantity', e.target.value)}
                  placeholder="Qty"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitPrice}
                  onChange={e => updateLine(idx, 'unitPrice', e.target.value)}
                  placeholder="Unit price"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 w-24 text-right font-medium">
                  ₹{lineTotal(line).toFixed(2)}
                </span>
                {lines.length > 1 && (
                  <button
                    onClick={() => removeLine(idx)}
                    className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                    aria-label="Remove line"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addLine}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            + Add Item
          </button>
        </div>

        {/* Total */}
        <div className="flex justify-end border-t border-gray-100 pt-4">
          <div className="text-right">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
            <p className="text-xl font-bold text-gray-900">₹{grandTotal.toFixed(2)}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={() => handleSave(false)}
            disabled={saving || !supplierId}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || !supplierId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Sending…' : 'Send to Supplier'}
          </button>
        </div>
      </div>
    </div>
  );
}

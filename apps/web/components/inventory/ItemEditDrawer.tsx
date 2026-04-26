'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import { inventoryApi } from '@/lib/api/inventory.api';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().optional(),
  abcCategory: z.enum(['A', 'B', 'C']).optional(),
  storageLocation: z.string().optional(),
  barcode: z.string().optional(),
  isPerishable: z.boolean().optional(),
  shelfLifeDays: z.coerce.number().int().positive().optional(),
  purchaseUnit: z.string().optional(),
  recipeUnit: z.string().optional(),
  countUnit: z.string().optional(),
  conversionFactor: z.coerce.number().positive().optional(),
  avgCost: z.coerce.number().min(0).optional(),
  parLevel: z.coerce.number().min(0).optional(),
  safetyStock: z.coerce.number().min(0).optional(),
  reorderQuantity: z.coerce.number().min(0).optional(),
  expiryAlertDays: z.coerce.number().int().min(0).optional(),
});

type FormData = z.infer<typeof schema>;

interface SupplierRow {
  name: string;
  price: string;
}

interface InventoryItem {
  id: string;
  name: string;
  category?: string;
  abcCategory?: 'A' | 'B' | 'C';
  storageLocation?: string;
  barcode?: string;
  isPerishable?: boolean;
  shelfLifeDays?: number;
  purchaseUnit?: string;
  recipeUnit?: string;
  countUnit?: string;
  conversionFactor?: number;
  avgCost?: number;
  parLevel?: number;
  safetyStock?: number;
  reorderQuantity?: number;
  expiryAlertDays?: number;
  suppliers?: { name: string; price: number }[];
}

interface Props {
  item?: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void;
}

const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export function ItemEditDrawer({ item, onClose, onSaved }: Props) {
  const isEdit = !!item;
  const [activeTab, setActiveTab] = useState('basic');
  const [isPerishable, setIsPerishable] = useState(item?.isPerishable ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierRows, setSupplierRows] = useState<SupplierRow[]>(
    item?.suppliers?.map(s => ({ name: s.name, price: String(s.price) })) ?? []
  );
  const [newSupplier, setNewSupplier] = useState<SupplierRow>({ name: '', price: '' });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: item?.name ?? '',
      category: item?.category ?? '',
      abcCategory: item?.abcCategory,
      storageLocation: item?.storageLocation ?? '',
      barcode: item?.barcode ?? '',
      isPerishable: item?.isPerishable ?? false,
      shelfLifeDays: item?.shelfLifeDays,
      purchaseUnit: item?.purchaseUnit ?? '',
      recipeUnit: item?.recipeUnit ?? '',
      countUnit: item?.countUnit ?? '',
      conversionFactor: item?.conversionFactor,
      avgCost: item?.avgCost,
      parLevel: item?.parLevel,
      safetyStock: item?.safetyStock,
      reorderQuantity: item?.reorderQuantity,
      expiryAlertDays: item?.expiryAlertDays,
    },
  });

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...data,
        suppliers: supplierRows
          .filter(r => r.name)
          .map(r => ({ name: r.name, price: parseFloat(r.price) || 0 })),
      };
      if (isEdit) {
        await inventoryApi.items.update(item.id, payload);
      } else {
        await inventoryApi.items.create(payload);
      }
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save item';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function addSupplierRow() {
    if (!newSupplier.name) return;
    setSupplierRows(rows => [...rows, newSupplier]);
    setNewSupplier({ name: '', price: '' });
  }

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Item' : 'Add Item'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-4 mb-4">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="units">Units</TabsTrigger>
              <TabsTrigger value="stock">Stock</TabsTrigger>
              <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            </TabsList>

            {/* BASIC INFO */}
            <TabsContent value="basic" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name <span className="text-red-500">*</span></Label>
                <Input id="name" {...register('name')} placeholder="e.g. Tomatoes" />
                {errors.name && <p className="text-red-600 text-xs">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input id="category" {...register('category')} placeholder="e.g. Vegetables" />
              </div>
              <div className="space-y-2">
                <Label>ABC Category</Label>
                <Select
                  defaultValue={item?.abcCategory}
                  onValueChange={val => setValue('abcCategory', val as 'A' | 'B' | 'C')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select A / B / C" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A — High Value</SelectItem>
                    <SelectItem value="B">B — Medium Value</SelectItem>
                    <SelectItem value="C">C — Low Value</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="storageLocation">Storage Location</Label>
                <Input id="storageLocation" {...register('storageLocation')} placeholder="e.g. Walk-in Cooler" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="barcode">Barcode</Label>
                <Input id="barcode" {...register('barcode')} placeholder="Scan or enter barcode" />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isPerishable"
                  checked={isPerishable}
                  onChange={e => {
                    setIsPerishable(e.target.checked);
                    setValue('isPerishable', e.target.checked);
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="isPerishable" className="cursor-pointer">Perishable item</Label>
              </div>
              <AnimatePresence>
                {isPerishable && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2 overflow-hidden"
                  >
                    <Label htmlFor="shelfLifeDays">Shelf Life (days)</Label>
                    <Input
                      id="shelfLifeDays"
                      type="number"
                      min={1}
                      {...register('shelfLifeDays')}
                      placeholder="e.g. 7"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>

            {/* UNITS & COST */}
            <TabsContent value="units" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purchaseUnit">Purchase Unit</Label>
                  <Input id="purchaseUnit" {...register('purchaseUnit')} placeholder="e.g. kg" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recipeUnit">Recipe Unit</Label>
                  <Input id="recipeUnit" {...register('recipeUnit')} placeholder="e.g. g" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="countUnit">Count Unit</Label>
                  <Input id="countUnit" {...register('countUnit')} placeholder="e.g. pcs" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conversionFactor">Conversion Factor</Label>
                  <Input
                    id="conversionFactor"
                    type="number"
                    step="0.001"
                    {...register('conversionFactor')}
                    placeholder="e.g. 1000 (kg→g)"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="avgCost">Average Cost (per purchase unit)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                  <Input
                    id="avgCost"
                    type="number"
                    step="0.01"
                    min={0}
                    className="pl-7"
                    {...register('avgCost')}
                    placeholder="0.00"
                  />
                </div>
                {item?.avgCost != null && (
                  <p className="text-xs text-gray-500">Current: {fmt.format(item.avgCost)}</p>
                )}
              </div>
            </TabsContent>

            {/* STOCK SETTINGS */}
            <TabsContent value="stock" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parLevel">PAR Level</Label>
                  <Input id="parLevel" type="number" step="0.01" min={0} {...register('parLevel')} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="safetyStock">Safety Stock</Label>
                  <Input id="safetyStock" type="number" step="0.01" min={0} {...register('safetyStock')} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reorderQuantity">Reorder Quantity</Label>
                  <Input id="reorderQuantity" type="number" step="0.01" min={0} {...register('reorderQuantity')} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiryAlertDays">Expiry Alert (days before)</Label>
                  <Input id="expiryAlertDays" type="number" min={0} {...register('expiryAlertDays')} placeholder="e.g. 3" />
                </div>
              </div>
            </TabsContent>

            {/* SUPPLIERS */}
            <TabsContent value="suppliers" className="space-y-4">
              <p className="text-sm text-gray-500">Linked suppliers and their unit prices</p>
              {supplierRows.length > 0 && (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Supplier</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Price</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {supplierRows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="px-3 py-2 text-gray-900">{row.name}</td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            {row.price ? fmt.format(parseFloat(row.price)) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setSupplierRows(rows => rows.filter((_, idx) => idx !== i))}
                              className="text-red-500 hover:text-red-700 text-xs"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Supplier Name</Label>
                  <Input
                    value={newSupplier.name}
                    onChange={e => setNewSupplier(s => ({ ...s, name: e.target.value }))}
                    placeholder="Supplier name"
                  />
                </div>
                <div className="w-28 space-y-1">
                  <Label className="text-xs">Price (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newSupplier.price}
                    onChange={e => setNewSupplier(s => ({ ...s, price: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addSupplierRow}>
                  Add
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <SheetFooter className="pt-4 border-t border-gray-200 flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving…
                </span>
              ) : isEdit ? 'Update Item' : 'Create Item'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

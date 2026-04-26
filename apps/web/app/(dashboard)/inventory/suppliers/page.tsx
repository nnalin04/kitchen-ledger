'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import { inventoryApi } from '@/lib/api/inventory.api';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  paymentTerms?: string;
  notes?: string;
  isActive?: boolean;
}

function SupplierDrawer({
  supplier,
  onClose,
  onSaved,
}: {
  supplier?: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!supplier;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: supplier?.name ?? '',
      contactPerson: supplier?.contactPerson ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
      address: supplier?.address ?? '',
      city: supplier?.city ?? '',
      paymentTerms: supplier?.paymentTerms ?? '',
      notes: supplier?.notes ?? '',
    },
  });

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        await inventoryApi.suppliers.update(supplier.id, data);
      } else {
        await inventoryApi.suppliers.create(data);
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save supplier');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Supplier' : 'Add Supplier'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="s-name">Name <span className="text-red-500">*</span></Label>
            <Input id="s-name" {...register('name')} placeholder="Supplier name" />
            {errors.name && <p className="text-red-600 text-xs">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-contact">Contact Person</Label>
            <Input id="s-contact" {...register('contactPerson')} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="s-phone">Phone</Label>
              <Input id="s-phone" {...register('phone')} placeholder="+91 98765 43210" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-city">City</Label>
              <Input id="s-city" {...register('city')} placeholder="e.g. Mumbai" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-email">Email</Label>
            <Input id="s-email" type="email" {...register('email')} placeholder="supplier@example.com" />
            {errors.email && <p className="text-red-600 text-xs">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-address">Address</Label>
            <Input id="s-address" {...register('address')} placeholder="Street address" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-terms">Payment Terms</Label>
            <Input id="s-terms" {...register('paymentTerms')} placeholder="e.g. Net 30" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-notes">Notes</Label>
            <textarea
              id="s-notes"
              {...register('notes')}
              rows={3}
              placeholder="Any additional notes…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <SheetFooter className="pt-4 border-t border-gray-200 flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving…
                </span>
              ) : isEdit ? 'Update' : 'Add Supplier'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default function SuppliersPage() {
  const { data, isLoading, mutate } = useSWR('inventory/suppliers', () =>
    inventoryApi.suppliers.list().then(r => r.data ?? [])
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const suppliers: Supplier[] = data ?? [];

  function openCreate() {
    setEditingSupplier(null);
    setDrawerOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditingSupplier(s);
    setDrawerOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await inventoryApi.suppliers.delete(deleteTarget.id);
      mutate();
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
        <Button onClick={openCreate}>+ Add Supplier</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">City</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 animate-pulse">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            <AnimatePresence>
              {!isLoading &&
                suppliers.map((s, i) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, delay: i * 0.05 }}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-gray-600">{s.contactPerson ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.city ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.isActive !== false
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {s.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(s)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                          onClick={() => setDeleteTarget(s)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
            </AnimatePresence>
          </tbody>
        </table>
        {!isLoading && suppliers.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No suppliers yet</p>
            <p className="text-sm mt-1">Add your first supplier to get started</p>
          </div>
        )}
      </div>

      {drawerOpen && (
        <SupplierDrawer
          supplier={editingSupplier}
          onClose={() => setDrawerOpen(false)}
          onSaved={() => { setDrawerOpen(false); mutate(); }}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Supplier</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
          </p>
          <DialogFooter className="flex gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button
              variant="outline"
              className="text-red-600 border-red-300 hover:bg-red-50"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

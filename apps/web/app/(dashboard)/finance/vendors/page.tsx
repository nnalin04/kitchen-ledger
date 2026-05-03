'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { financeApi } from '@/lib/api/finance.api';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface Vendor {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  payment_terms?: string;
  notes?: string;
  outstanding_balance?: number;
}

interface VendorFormState {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  payment_terms: string;
  notes: string;
}

const EMPTY_FORM: VendorFormState = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  payment_terms: '',
  notes: '',
};

const darkInputClass =
  'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-colors';

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function fmt(n?: number) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

const SWR_KEY = 'finance/vendors';

export default function VendorsPage() {
  const shouldReduce = useReducedMotion();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VendorFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const { data, isLoading, error } = useSWR(SWR_KEY, () => financeApi.vendors.list());

  const vendors: Vendor[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  const set = (key: keyof VendorFormState) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError('');
    setSheetOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setEditingId(vendor.id);
    setForm({
      name: vendor.name,
      contact_person: vendor.contact_person ?? '',
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      address: vendor.address ?? '',
      payment_terms: vendor.payment_terms ?? '',
      notes: vendor.notes ?? '',
    });
    setSaveError('');
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      setSaveError('Vendor name is required.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        name: form.name,
        contact_person: form.contact_person || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        payment_terms: form.payment_terms || undefined,
        notes: form.notes || undefined,
      };
      if (editingId) {
        await financeApi.vendors.update(editingId, payload);
      } else {
        await financeApi.vendors.create(payload);
      }
      setSheetOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      mutate(SWR_KEY);
    } catch {
      setSaveError('Failed to save vendor. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-slate-100">Vendors</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage your supplier contacts</p>
        </div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <motion.button
              onClick={openAdd}
              whileHover={shouldReduce ? {} : { scale: 1.02, boxShadow: '0 4px 12px rgba(37,99,235,0.35)' }}
              whileTap={shouldReduce ? {} : { scale: 0.97 }}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-lg text-sm font-medium transition-all"
            >
              + Add Vendor
            </motion.button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-slate-900 border-slate-800 text-slate-100">
            <SheetHeader>
              <SheetTitle className="font-serif text-slate-100">{editingId ? 'Edit Vendor' : 'Add Vendor'}</SheetTitle>
            </SheetHeader>
            <motion.div
              className="mt-6 space-y-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.05 }}
            >
              <FormField label="Vendor Name *">
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name')(e.target.value)}
                  placeholder="e.g. Fresh Farms Supplies"
                  className={darkInputClass}
                />
              </FormField>

              <FormField label="Contact Person">
                <input
                  type="text"
                  value={form.contact_person}
                  onChange={e => set('contact_person')(e.target.value)}
                  placeholder="Full name"
                  className={darkInputClass}
                />
              </FormField>

              <FormField label="Phone">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => set('phone')(e.target.value)}
                  placeholder="+91 98765 43210"
                  className={darkInputClass}
                />
              </FormField>

              <FormField label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email')(e.target.value)}
                  placeholder="vendor@example.com"
                  className={darkInputClass}
                />
              </FormField>

              <FormField label="Address">
                <textarea
                  value={form.address}
                  onChange={e => set('address')(e.target.value)}
                  rows={2}
                  placeholder="Street, City, State"
                  className={`${darkInputClass} resize-none`}
                />
              </FormField>

              <FormField label="Payment Terms">
                <input
                  type="text"
                  value={form.payment_terms}
                  onChange={e => set('payment_terms')(e.target.value)}
                  placeholder="e.g. Net 30, COD"
                  className={darkInputClass}
                />
              </FormField>

              <FormField label="Notes">
                <textarea
                  value={form.notes}
                  onChange={e => set('notes')(e.target.value)}
                  rows={3}
                  placeholder="Any additional notes…"
                  className={`${darkInputClass} resize-none`}
                />
              </FormField>

              <AnimatePresence>
                {saveError && (
                  <motion.p
                    className="text-sm text-red-400"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                  >
                    {saveError}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="flex gap-3 pt-2">
                <motion.button
                  onClick={handleSave}
                  disabled={saving}
                  whileHover={shouldReduce ? {} : { scale: 1.02 }}
                  whileTap={shouldReduce ? {} : { scale: 0.97 }}
                  className="flex-1 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editingId ? 'Update Vendor' : 'Add Vendor'}
                </motion.button>
                <motion.button
                  onClick={() => { setSheetOpen(false); setSaveError(''); }}
                  whileHover={shouldReduce ? {} : { scale: 1.02 }}
                  whileTap={shouldReduce ? {} : { scale: 0.97 }}
                  className="px-4 py-2 border border-slate-700 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
        >
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800">
              <tr>
                {['Vendor Name', 'Contact', 'Phone', 'Email', 'Outstanding', ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3">
                    {h && <div className="h-3 bg-slate-800 rounded w-20 animate-pulse" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800/60 rounded w-32 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800/60 rounded w-24 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800/60 rounded w-28 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800/60 rounded w-36 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800/60 rounded w-20 ml-auto animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800/60 rounded w-8 ml-auto animate-pulse" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-red-400">Failed to load data</p>}

      {!isLoading && !error && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(14,18,35,0.95)', boxShadow: '0 0 0 1px rgba(30,41,59,0.8)' }}
        >
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 sticky top-0 z-10" style={{ background: 'rgba(10,12,25,0.95)' }}>
              <tr>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Vendor Name</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Contact Person</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Phone</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Email</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Outstanding</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {vendors.map((vendor, index) => (
                <motion.tr
                  key={vendor.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.035, duration: 0.2 }}
                  className="group hover:bg-slate-800/40 transition-colors border-l-2 border-l-transparent hover:border-l-blue-500"
                >
                  <td className="px-4 py-3 font-medium text-slate-200">{vendor.name}</td>
                  <td className="px-4 py-3 text-slate-400">{vendor.contact_person ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{vendor.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{vendor.email ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums font-mono text-slate-100">
                    {fmt(vendor.outstanding_balance)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <motion.button
                      onClick={() => openEdit(vendor)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
                    >
                      Edit
                    </motion.button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {vendors.length === 0 && (
            <div className="py-16 flex flex-col items-center gap-3 text-slate-500">
              <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="font-medium text-sm text-slate-400">No vendors yet</p>
              <p className="text-xs text-slate-600">Add your first vendor to get started</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

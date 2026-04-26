'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { financeApi } from '@/lib/api/finance.api';
import { apiClient } from '@/lib/api/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  tax_amount?: number;
  payment_method?: string;
  status?: string;
  due_date?: string;
  account_id?: string;
  vendor_id?: string;
  notes?: string;
  vendor_name?: string;
  receipt_url?: string;
  category?: string;
}

interface Vendor {
  id: string;
  name: string;
}

export interface ExpenseFormProps {
  expense?: Expense;
  onClose: () => void;
  onSaved: () => void;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const expenseSchema = z
  .object({
    date: z.string().min(1, 'Date is required'),
    description: z.string().min(1, 'Description is required'),
    amount: z.coerce.number({ invalid_type_error: 'Amount is required' }).positive('Amount must be > 0'),
    tax_amount: z.coerce.number().min(0).optional(),
    payment_method: z.enum(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE']).default('CASH'),
    status: z.enum(['PENDING', 'PAID', 'OVERDUE']).default('PAID'),
    due_date: z.string().optional(),
    account_id: z.string().optional(),
    vendor_id: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'PENDING' && !data.due_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Due date is required when status is Pending',
        path: ['due_date'],
      });
    }
  });

type ExpenseFormValues = z.infer<typeof expenseSchema>;

// ── Label helper ──────────────────────────────────────────────────────────────

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {children}
    </label>
  );
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

const errorClass = 'text-xs text-red-600 mt-0.5';

// ── OCR Status ────────────────────────────────────────────────────────────────

type OcrStatus = 'idle' | 'uploading' | 'scanning' | 'done' | 'error';

// ── Main Component ────────────────────────────────────────────────────────────

export function ExpenseForm({ expense, onClose, onSaved }: ExpenseFormProps) {
  const isEdit = !!expense?.id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vendor list
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);

  // OCR state
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('idle');
  const [ocrError, setOcrError] = useState('');
  const [ocrNotice, setOcrNotice] = useState('');

  useEffect(() => {
    setVendorsLoading(true);
    financeApi.vendors
      .list()
      .then(res => {
        const list: Vendor[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setVendors(list);
      })
      .catch(() => setVendors([]))
      .finally(() => setVendorsLoading(false));
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: expense?.date ?? new Date().toISOString().split('T')[0],
      description: expense?.description ?? '',
      amount: expense?.amount ?? ('' as unknown as number),
      tax_amount: expense?.tax_amount,
      payment_method: (expense?.payment_method?.toUpperCase() as ExpenseFormValues['payment_method']) ?? 'CASH',
      status: (expense?.status?.toUpperCase() as ExpenseFormValues['status']) ?? 'PAID',
      due_date: expense?.due_date ?? '',
      account_id: expense?.account_id ?? '',
      vendor_id: expense?.vendor_id ?? '',
      notes: expense?.notes ?? '',
    },
  });

  const status = watch('status');

  const onSubmit = async (values: ExpenseFormValues) => {
    const payload = {
      date: values.date,
      description: values.description,
      amount: values.amount,
      tax_amount: values.tax_amount ?? undefined,
      payment_method: values.payment_method,
      status: values.status,
      due_date: values.due_date || undefined,
      account_id: values.account_id || undefined,
      vendor_id: values.vendor_id || undefined,
      notes: values.notes || undefined,
    };

    if (isEdit) {
      await financeApi.expenses.update(expense.id, payload);
    } else {
      await financeApi.expenses.create(payload);
    }
    reset();
    onSaved();
  };

  // ── Receipt OCR ───────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrStatus('uploading');
    setOcrError('');
    setOcrNotice('');

    try {
      // Step 1: Upload to file service
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await apiClient.post('/api/v1/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fileUrl: string = uploadRes.data?.data?.url ?? uploadRes.data?.url;
      if (!fileUrl) throw new Error('Upload did not return a URL');

      setOcrStatus('scanning');

      // Step 2: Trigger OCR job
      const ocrRes = await apiClient.post('/api/v1/ai/ocr/receipt', { file_url: fileUrl });
      const jobId: string = ocrRes.data?.data?.job_id ?? ocrRes.data?.job_id;

      if (!jobId) {
        // Some backends return result directly
        applyOcrResult(ocrRes.data?.data ?? ocrRes.data);
        return;
      }

      // Step 3: Poll job status
      let attempts = 0;
      const maxAttempts = 15;
      const poll = async (): Promise<void> => {
        if (attempts >= maxAttempts) {
          setOcrStatus('error');
          setOcrError('OCR timed out — please fill fields manually.');
          return;
        }
        attempts++;
        const statusRes = await apiClient.get(`/api/v1/ai/ocr/jobs/${jobId}`);
        const job = statusRes.data?.data ?? statusRes.data;
        if (job?.status === 'completed') {
          applyOcrResult(job.result);
        } else if (job?.status === 'failed') {
          setOcrStatus('error');
          setOcrError('OCR failed — please fill fields manually.');
        } else {
          await new Promise(r => setTimeout(r, 2000));
          return poll();
        }
      };

      await poll();
    } catch {
      setOcrStatus('error');
      setOcrError('OCR unavailable — please fill fields manually.');
    }
  };

  function applyOcrResult(result: Record<string, unknown>) {
    if (result?.description) setValue('description', String(result.description));
    if (result?.amount) setValue('amount', Number(result.amount));
    if (result?.tax_amount) setValue('tax_amount', Number(result.tax_amount));
    if (result?.vendor_name) {
      // Try to match to an existing vendor
      const match = vendors.find(
        v => v.name.toLowerCase() === String(result.vendor_name).toLowerCase()
      );
      if (match) setValue('vendor_id', match.id);
    }
    setOcrStatus('done');
    setOcrNotice('Auto-filled from receipt — please verify the values.');
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Expense' : 'Add Expense'}</SheetTitle>
        </SheetHeader>

        <motion.form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-6 space-y-4 pb-8"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
        >
          {/* ── Receipt Upload / OCR ─────────────────────────── */}
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-4 text-center space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileChange}
              className="hidden"
              id="receipt-upload"
            />

            {ocrStatus === 'idle' && (
              <>
                <svg
                  className="w-8 h-8 mx-auto text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
                  />
                </svg>
                <p className="text-sm text-gray-500">Drag & drop a receipt or</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Browse file
                </button>
                <p className="text-xs text-gray-400">JPG, PNG or PDF — OCR will auto-fill fields</p>
              </>
            )}

            {(ocrStatus === 'uploading' || ocrStatus === 'scanning') && (
              <div className="flex flex-col items-center gap-2 py-2">
                <span className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-600">
                  {ocrStatus === 'uploading' ? 'Uploading receipt…' : 'Scanning receipt…'}
                </p>
              </div>
            )}

            {ocrStatus === 'done' && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-green-700 font-medium">Receipt scanned</p>
                <button
                  type="button"
                  onClick={() => {
                    setOcrStatus('idle');
                    setOcrNotice('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            )}

            {ocrStatus === 'error' && (
              <div className="space-y-1">
                <p className="text-sm text-red-600">{ocrError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setOcrStatus('idle');
                    setOcrError('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>

          <AnimatePresence>
            {ocrNotice && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-start gap-2"
              >
                <span className="text-blue-500 mt-0.5 shrink-0">ℹ</span>
                <p className="text-sm text-blue-700">{ocrNotice}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Date ──────────────────────────────────────────── */}
          <div>
            <Label htmlFor="date">Date *</Label>
            <input id="date" type="date" {...register('date')} className={inputClass} />
            {errors.date && <p className={errorClass}>{errors.date.message}</p>}
          </div>

          {/* ── Description ───────────────────────────────────── */}
          <div>
            <Label htmlFor="description">Description *</Label>
            <input
              id="description"
              type="text"
              placeholder="What was this expense for?"
              {...register('description')}
              className={inputClass}
            />
            {errors.description && <p className={errorClass}>{errors.description.message}</p>}
          </div>

          {/* ── Amount + Tax ───────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="amount">Amount (₹) *</Label>
              <input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...register('amount')}
                className={inputClass}
              />
              {errors.amount && <p className={errorClass}>{errors.amount.message}</p>}
            </div>
            <div>
              <Label htmlFor="tax_amount">Tax Amount (₹)</Label>
              <input
                id="tax_amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...register('tax_amount')}
                className={inputClass}
              />
              {errors.tax_amount && <p className={errorClass}>{errors.tax_amount.message}</p>}
            </div>
          </div>

          {/* ── Payment Method ────────────────────────────────── */}
          <div>
            <Label htmlFor="payment_method">Payment Method</Label>
            <Select
              defaultValue="CASH"
              onValueChange={v => setValue('payment_method', v as ExpenseFormValues['payment_method'])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE'] as const).map(m => (
                  <SelectItem key={m} value={m}>
                    {m === 'BANK_TRANSFER' ? 'Bank Transfer' : m.charAt(0) + m.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Status ───────────────────────────────────────── */}
          <div>
            <Label htmlFor="status">Status</Label>
            <Select
              defaultValue="PAID"
              onValueChange={v => setValue('status', v as ExpenseFormValues['status'])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['PAID', 'PENDING', 'OVERDUE'] as const).map(s => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Due Date (shown only when PENDING) ───────────── */}
          <AnimatePresence>
            {status === 'PENDING' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Label htmlFor="due_date">Due Date *</Label>
                <input id="due_date" type="date" {...register('due_date')} className={inputClass} />
                {errors.due_date && <p className={errorClass}>{errors.due_date.message}</p>}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Vendor ───────────────────────────────────────── */}
          <div>
            <Label htmlFor="vendor_id">Vendor</Label>
            {vendorsLoading ? (
              <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
            ) : vendors.length > 0 ? (
              <Select onValueChange={v => setValue('vendor_id', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No vendor</SelectItem>
                  {vendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <input
                id="vendor_id"
                type="text"
                placeholder="Vendor name"
                {...register('vendor_id')}
                className={inputClass}
              />
            )}
          </div>

          {/* ── Notes ─────────────────────────────────────────── */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              rows={3}
              placeholder="Any additional notes…"
              {...register('notes')}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* ── Actions ───────────────────────────────────────── */}
          <div className="flex gap-3 pt-2">
            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow-md transition-shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : isEdit ? (
                'Save Changes'
              ) : (
                'Add Expense'
              )}
            </motion.button>
            <motion.button
              type="button"
              onClick={onClose}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </motion.button>
          </div>
        </motion.form>
      </SheetContent>
    </Sheet>
  );
}

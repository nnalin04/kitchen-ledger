'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { financeApi } from '@/lib/api/finance.api';
import { UPIQRModal } from '@/components/finance/UPIQRModal';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DSRData {
  gross_sales?: number;
  food_sales?: number;
  beverage_sales?: number;
  other_sales?: number;
  comps?: number;
  voids?: number;
  discounts?: number;
  guest_count?: number;
  cash_sales?: number;
  card_sales?: number;
  upi_sales?: number;
  delivery_platform_sales?: number;
  tips_collected?: number;
  cash_counted?: number;
  variance_explanation?: string;
  status?: string;
}

export interface DSRWizardProps {
  date: string;
  initialData?: DSRData;
  onComplete: () => void;
}

interface FormState {
  grossSales: string;
  foodSales: string;
  beverageSales: string;
  otherSales: string;
  comps: string;
  voids: string;
  discounts: string;
  guestCount: string;
  cashSales: string;
  cardSales: string;
  upiSales: string;
  deliveryPlatformSales: string;
  tipsCollected: string;
  cashCounted: string;
  varianceExplanation: string;
}

function makeInitialForm(data?: DSRData): FormState {
  return {
    grossSales: data?.gross_sales != null ? String(data.gross_sales) : '',
    foodSales: data?.food_sales != null ? String(data.food_sales) : '',
    beverageSales: data?.beverage_sales != null ? String(data.beverage_sales) : '',
    otherSales: data?.other_sales != null ? String(data.other_sales) : '',
    comps: data?.comps != null ? String(data.comps) : '0',
    voids: data?.voids != null ? String(data.voids) : '0',
    discounts: data?.discounts != null ? String(data.discounts) : '0',
    guestCount: data?.guest_count != null ? String(data.guest_count) : '',
    cashSales: data?.cash_sales != null ? String(data.cash_sales) : '',
    cardSales: data?.card_sales != null ? String(data.card_sales) : '',
    upiSales: data?.upi_sales != null ? String(data.upi_sales) : '',
    deliveryPlatformSales:
      data?.delivery_platform_sales != null ? String(data.delivery_platform_sales) : '',
    tipsCollected: data?.tips_collected != null ? String(data.tips_collected) : '0',
    cashCounted: data?.cash_counted != null ? String(data.cash_counted) : '',
    varianceExplanation: data?.variance_explanation ?? '',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);

const n = (s: string) => parseFloat(s || '0') || 0;

// ── Field ─────────────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  id: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  hint?: string;
  colorClass?: string;
}

function Field({ label, id, value, onChange, readOnly, hint, colorClass }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm pointer-events-none">
          ₹
        </span>
        <input
          id={id}
          type="number"
          value={value}
          readOnly={readOnly}
          onChange={e => onChange?.(e.target.value)}
          className={`w-full pl-7 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            readOnly ? 'bg-gray-50 text-gray-600 cursor-default' : 'bg-white'
          } ${colorClass ?? 'border-gray-300'}`}
          step="0.01"
          min="0"
        />
      </div>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ── Step Indicator ────────────────────────────────────────────────────────────

const STEP_LABELS = ['Sales Entry', 'Payments', 'Cash Count', 'Reconcile'];

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-between w-full">
      {STEP_LABELS.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <motion.div
              animate={{
                backgroundColor:
                  i < step ? '#22c55e' : i === step ? '#2563eb' : '#e5e7eb',
                scale: i === step ? 1.1 : 1,
              }}
              transition={{ duration: 0.2 }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
            >
              {i < step ? '✓' : i + 1}
            </motion.div>
            <span
              className={`text-xs mt-1 hidden sm:block whitespace-nowrap ${
                i === step ? 'text-gray-900 font-semibold' : i < step ? 'text-green-600' : 'text-gray-400'
              }`}
            >
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div
              className={`flex-1 h-0.5 mx-2 mb-3 transition-colors duration-300 ${
                i < step ? 'bg-green-400' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Sales Entry ───────────────────────────────────────────────────────

interface SalesStepProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  netSales: number;
  error: string;
}

function SalesStep({ form, setForm, netSales, error }: SalesStepProps) {
  const set = (key: keyof FormState) => (v: string) => setForm(f => ({ ...f, [key]: v }));

  const subTotal = n(form.foodSales) + n(form.beverageSales) + n(form.otherSales);
  const gross = n(form.grossSales);
  const subExceeds = subTotal > gross && gross > 0;

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-gray-800 text-lg">Sales Entry</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Field
            label="Gross Sales *"
            id="grossSales"
            value={form.grossSales}
            onChange={set('grossSales')}
          />
        </div>
        <Field label="Food Sales" id="foodSales" value={form.foodSales} onChange={set('foodSales')} />
        <Field label="Beverage Sales" id="beverageSales" value={form.beverageSales} onChange={set('beverageSales')} />
        <Field label="Other Sales" id="otherSales" value={form.otherSales} onChange={set('otherSales')} />
        <div className="col-span-1">
          <label htmlFor="guestCount" className="block text-sm font-medium text-gray-700 mb-1">
            Guest Count
          </label>
          <input
            id="guestCount"
            type="number"
            value={form.guestCount}
            onChange={e => set('guestCount')(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            min="0"
          />
        </div>
        <Field label="Comps" id="comps" value={form.comps} onChange={set('comps')} />
        <Field label="Voids" id="voids" value={form.voids} onChange={set('voids')} />
        <Field label="Discounts" id="discounts" value={form.discounts} onChange={set('discounts')} />
      </div>

      {subExceeds && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Food + Beverage + Other sales ({INR(subTotal)}) exceed Gross Sales ({INR(gross)})
        </p>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-blue-700">Net Sales (calculated)</span>
        <span className="text-xl font-bold text-blue-900 tabular-nums">{INR(netSales)}</span>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Step 2: Payment Breakdown ─────────────────────────────────────────────────

interface PaymentsStepProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  netSales: number;
  error: string;
  onOpenQR: () => void;
}

function PaymentsStep({ form, setForm, netSales, error, onOpenQR }: PaymentsStepProps) {
  const set = (key: keyof FormState) => (v: string) => setForm(f => ({ ...f, [key]: v }));

  const total =
    n(form.cashSales) + n(form.cardSales) + n(form.upiSales) + n(form.deliveryPlatformSales);
  const diff = total - netSales;
  const hasData = total > 0;
  const isBalanced = hasData && Math.abs(diff) < 0.01;

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-gray-800 text-lg">Payment Breakdown</h2>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Cash Sales" id="cashSales" value={form.cashSales} onChange={set('cashSales')} />
        <Field label="Card Sales" id="cardSales" value={form.cardSales} onChange={set('cardSales')} />

        {/* UPI with QR button */}
        <div>
          <label htmlFor="upiSales" className="block text-sm font-medium text-gray-700 mb-1">
            UPI Sales
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm pointer-events-none">
                ₹
              </span>
              <input
                id="upiSales"
                type="number"
                value={form.upiSales}
                onChange={e => set('upiSales')(e.target.value)}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                step="0.01"
                min="0"
              />
            </div>
            <button
              type="button"
              onClick={onOpenQR}
              className="shrink-0 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors"
            >
              QR
            </button>
          </div>
        </div>

        <Field
          label="Delivery Platform"
          id="deliveryPlatformSales"
          value={form.deliveryPlatformSales}
          onChange={set('deliveryPlatformSales')}
        />
        <div className="col-span-2">
          <Field
            label="Tips Collected"
            id="tipsCollected"
            value={form.tipsCollected}
            onChange={set('tipsCollected')}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {hasData && (
          <motion.div
            key={isBalanced ? 'ok' : 'err'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`rounded-xl p-3 flex items-center justify-between border ${
              isBalanced ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
            }`}
          >
            <span className={`text-sm font-medium ${isBalanced ? 'text-green-700' : 'text-amber-700'}`}>
              {isBalanced
                ? 'Payment total matches Net Sales'
                : `Total ${INR(total)} — Net Sales ${INR(netSales)}`}
            </span>
            {!isBalanced && (
              <span className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">
                {diff > 0 ? '+' : ''}
                {INR(diff)}
              </span>
            )}
            {isBalanced && <span className="text-green-600 text-sm">✓</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Step 3: Cash Count ────────────────────────────────────────────────────────

interface CashStepProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  overShort: number;
  error: string;
}

function CashStep({ form, setForm, overShort, error }: CashStepProps) {
  const set = (key: keyof FormState) => (v: string) => setForm(f => ({ ...f, [key]: v }));
  const abs = Math.abs(overShort);
  const hasCounted = form.cashCounted !== '';
  const requiresExplanation = hasCounted && abs > 50;

  const colorCls =
    abs === 0
      ? 'bg-green-50 border-green-200 text-green-700'
      : abs <= 50
      ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
      : 'bg-red-50 border-red-200 text-red-700';

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-gray-800 text-lg">Cash Count</h2>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Cash Expected"
          id="cashExpected"
          value={form.cashSales}
          readOnly
          hint="From Step 2 cash sales"
        />
        <Field
          label="Cash Counted *"
          id="cashCounted"
          value={form.cashCounted}
          onChange={set('cashCounted')}
        />
      </div>

      <AnimatePresence>
        {hasCounted && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`rounded-xl border p-4 flex items-center justify-between ${colorCls}`}
          >
            <span className="text-sm font-semibold">
              Cash {overShort >= 0 ? 'Over' : 'Short'}
            </span>
            <span className="text-xl font-bold tabular-nums">
              {overShort > 0 ? '+' : ''}
              {INR(overShort)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {requiresExplanation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <label
              htmlFor="varianceExplanation"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Variance Explanation <span className="text-red-500">*</span>
            </label>
            <textarea
              id="varianceExplanation"
              value={form.varianceExplanation}
              onChange={e => setForm(f => ({ ...f, varianceExplanation: e.target.value }))}
              rows={3}
              placeholder="Explain the cash variance…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Step 4: Review & Reconcile ────────────────────────────────────────────────

interface ReconcileStepProps {
  form: FormState;
  netSales: number;
  overShort: number;
  onReconcile: () => void;
  error: string;
  saving: boolean;
  reconciled: boolean;
}

function ReconcileStep({
  form,
  netSales,
  overShort,
  onReconcile,
  error,
  saving,
  reconciled,
}: ReconcileStepProps) {
  const rows = [
    { label: 'Gross Sales', value: INR(n(form.grossSales)) },
    {
      label: 'Comps / Voids / Discounts',
      value: `−${INR(n(form.comps) + n(form.voids) + n(form.discounts))}`,
    },
    { label: 'Net Sales', value: INR(netSales) },
    { label: 'Guest Count', value: form.guestCount || '—' },
    { label: 'Cash Sales', value: INR(n(form.cashSales)) },
    { label: 'Card Sales', value: INR(n(form.cardSales)) },
    { label: 'UPI Sales', value: INR(n(form.upiSales)) },
    { label: 'Delivery Platform Sales', value: INR(n(form.deliveryPlatformSales)) },
    { label: 'Tips Collected', value: INR(n(form.tipsCollected)) },
    {
      label: 'Cash Counted',
      value: form.cashCounted ? INR(parseFloat(form.cashCounted)) : '—',
    },
    {
      label: 'Cash Over/Short',
      value: `${overShort >= 0 ? '+' : ''}${INR(overShort)}`,
    },
  ];

  if (reconciled) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="text-center py-8 space-y-3"
      >
        <div className="text-6xl">✅</div>
        <h2 className="text-xl font-bold text-green-700">Report Reconciled!</h2>
        <p className="text-gray-500 text-sm">Sales report for {form.grossSales ? 'this date' : 'today'} has been reconciled.</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-gray-800 text-lg">Review & Reconcile</h2>

      <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => (
              <tr key={row.label}>
                <td className="px-4 py-2.5 text-gray-500">{row.label}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form.varianceExplanation && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">Variance Explanation</p>
          <p className="text-sm text-amber-800">{form.varianceExplanation}</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={onReconcile}
        disabled={saving}
        className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Reconciling…
          </>
        ) : (
          'Reconcile Report'
        )}
      </button>
    </div>
  );
}

// ── Wizard ────────────────────────────────────────────────────────────────────

export function DSRWizard({ date, initialData, onComplete }: DSRWizardProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => makeInitialForm(initialData));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  const [upiOpen, setUpiOpen] = useState(false);

  const netSales =
    n(form.grossSales) - n(form.comps) - n(form.voids) - n(form.discounts);
  const overShort = n(form.cashCounted) - n(form.cashSales);

  // ── Step validation ───────────────────────────────────────────────────────

  function validateStep(s: number): string {
    if (s === 0) {
      if (!form.grossSales || n(form.grossSales) <= 0) return 'Gross sales is required.';
    }
    if (s === 2) {
      if (form.cashCounted === '') return 'Cash counted is required.';
      if (Math.abs(overShort) > 50 && !form.varianceExplanation.trim()) {
        return 'Please explain the cash variance (> ₹50).';
      }
    }
    return '';
  }

  // ── Save step data to backend ─────────────────────────────────────────────

  const saveAndNext = async () => {
    const validationErr = validateStep(step);
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setError('');
    setSaving(true);
    try {
      await financeApi.dailyReports.save(date, {
        gross_sales: n(form.grossSales),
        food_sales: n(form.foodSales),
        beverage_sales: n(form.beverageSales),
        other_sales: n(form.otherSales),
        comps: n(form.comps),
        voids: n(form.voids),
        discounts: n(form.discounts),
        guest_count: form.guestCount ? parseInt(form.guestCount, 10) : undefined,
        cash_sales: n(form.cashSales),
        card_sales: n(form.cardSales),
        upi_sales: n(form.upiSales),
        delivery_platform_sales: n(form.deliveryPlatformSales),
        tips_collected: n(form.tipsCollected),
        cash_counted: form.cashCounted ? parseFloat(form.cashCounted) : undefined,
        variance_explanation: form.varianceExplanation || undefined,
      });
      setStep(s => s + 1);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setError(err.response?.data?.error?.message ?? 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Reconcile ─────────────────────────────────────────────────────────────

  const handleReconcile = async () => {
    setError('');
    setSaving(true);
    try {
      await financeApi.dailyReports.reconcile(date, {
        cash_counted: parseFloat(form.cashCounted),
        variance_explanation: form.varianceExplanation || undefined,
      });
      setReconciled(true);
      setTimeout(() => onComplete(), 1200);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setError(err.response?.data?.error?.message ?? 'Reconciliation failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    setError('');
    setStep(s => s - 1);
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      {!reconciled && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <StepIndicator step={step} />
        </div>
      )}

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          {step === 0 && (
            <SalesStep form={form} setForm={setForm} netSales={netSales} error={error} />
          )}
          {step === 1 && (
            <PaymentsStep
              form={form}
              setForm={setForm}
              netSales={netSales}
              error={error}
              onOpenQR={() => setUpiOpen(true)}
            />
          )}
          {step === 2 && (
            <CashStep form={form} setForm={setForm} overShort={overShort} error={error} />
          )}
          {step === 3 && (
            <ReconcileStep
              form={form}
              netSales={netSales}
              overShort={overShort}
              onReconcile={handleReconcile}
              error={error}
              saving={saving}
              reconciled={reconciled}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      {!reconciled && step < 3 && (
        <div className="flex items-center justify-between">
          {step > 0 ? (
            <button
              onClick={goBack}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={saveAndNext}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              'Next →'
            )}
          </button>
        </div>
      )}

      {/* UPI QR Modal */}
      <UPIQRModal
        open={upiOpen}
        onClose={() => setUpiOpen(false)}
        reportDate={date}
        onManualPay={() => {
          if (!form.upiSales) {
            setForm(f => ({ ...f, upiSales: String(netSales) }));
          }
        }}
      />
    </div>
  );
}

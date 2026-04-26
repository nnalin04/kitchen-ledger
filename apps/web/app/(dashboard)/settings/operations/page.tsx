'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

// ── Data ──────────────────────────────────────────────────────────────────────

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fetcher = (url: string) => apiClient.get(url).then((r: { data: { data?: unknown; [k: string]: unknown } }) => r.data?.data ?? r.data);

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0">
        {icon}
      </div>
      <h2 className="text-base font-semibold text-gray-800">{children}</h2>
    </div>
  );
}

// Cost target color thresholds
function getCostColor(value: number, goodThreshold: number): { bar: string; text: string; label: string } {
  if (value <= goodThreshold) {
    return { bar: 'from-green-400 to-green-500', text: 'text-green-700', label: 'On Target' };
  }
  if (value <= goodThreshold + 10) {
    return { bar: 'from-yellow-400 to-amber-500', text: 'text-amber-700', label: 'Slightly Over' };
  }
  return { bar: 'from-red-400 to-red-500', text: 'text-red-700', label: 'Over Target' };
}

function PercentInput({
  label,
  value,
  onChange,
  goodThreshold,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  goodThreshold: number;
}) {
  const colors = getCostColor(value, goodThreshold);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${colors.text}`}>{colors.label}</span>
          <span className={`text-sm font-bold ${colors.text} w-10 text-right tabular-nums`}>{value}%</span>
        </div>
      </div>
      <div className="relative">
        <div className="w-full bg-gray-100 rounded-full h-2 mb-2 overflow-hidden">
          <motion.div
            className={`h-2 rounded-full bg-gradient-to-r ${colors.bar}`}
            animate={{ width: `${value}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full accent-blue-600 h-2 rounded-lg cursor-pointer"
          style={{ marginTop: '-0.5rem' }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-300">
        <span>0%</span>
        <span className="text-gray-400">Good ≤{goodThreshold}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={ariaLabel}
      className={`relative inline-flex h-6 w-11 items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer ${
        checked ? 'bg-green-500' : 'bg-gray-200'
      }`}
      style={{ transition: 'background-color 0.2s ease' }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow-sm"
        style={{
          transform: checked ? 'translateX(24px)' : 'translateX(2px)',
          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </button>
  );
}

// ── Save button with success state ────────────────────────────────────────────

function SaveButton({ saving, savedKey }: { saving: boolean; savedKey: number }) {
  const [showCheck, setShowCheck] = useState(false);

  useEffect(() => {
    if (savedKey > 0) {
      setShowCheck(true);
      const t = setTimeout(() => setShowCheck(false), 2000);
      return () => clearTimeout(t);
    }
  }, [savedKey]);

  return (
    <motion.button
      type="submit"
      disabled={saving}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed ${
        showCheck
          ? 'bg-green-600'
          : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50'
      }`}
    >
      <AnimatePresence mode="wait">
        {showCheck ? (
          <motion.span
            key="check"
            className="flex items-center gap-2"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Saved!
          </motion.span>
        ) : (
          <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {saving ? 'Saving...' : 'Save Settings'}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface OperationsSettings {
  timezone: string;
  currency: string;
  locale: string;
  cash_variance_threshold: number;
  food_cost_target_pct: number;
  labor_cost_target_pct: number;
  prime_cost_target_pct: number;
  upi_id: string;
  upi_enabled: boolean;
  expiry_alert_days: number;
  fiscal_year_start_month: number;
}

const DEFAULTS: OperationsSettings = {
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  locale: 'en-IN',
  cash_variance_threshold: 500,
  food_cost_target_pct: 35,
  labor_cost_target_pct: 30,
  prime_cost_target_pct: 65,
  upi_id: '',
  upi_enabled: false,
  expiry_alert_days: 3,
  fiscal_year_start_month: 4,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OperationsSettingsPage() {
  const { data: tenantProfile } = useSWR('/api/auth/tenant/profile', fetcher);
  const [settings, setSettings] = useState<OperationsSettings>(DEFAULTS);
  const [tzSearch, setTzSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (tenantProfile) {
      setSettings(prev => ({
        ...prev,
        timezone: tenantProfile.timezone ?? prev.timezone,
        currency: tenantProfile.currency ?? prev.currency,
        locale: tenantProfile.locale ?? prev.locale,
        cash_variance_threshold: tenantProfile.cash_variance_threshold ?? prev.cash_variance_threshold,
        food_cost_target_pct: tenantProfile.food_cost_target_pct ?? tenantProfile.settings?.food_cost_target_pct ?? prev.food_cost_target_pct,
        labor_cost_target_pct: tenantProfile.labor_cost_target_pct ?? tenantProfile.settings?.labor_cost_target_pct ?? prev.labor_cost_target_pct,
        prime_cost_target_pct: tenantProfile.prime_cost_target_pct ?? tenantProfile.settings?.prime_cost_target_pct ?? prev.prime_cost_target_pct,
        upi_id: tenantProfile.upi_id ?? tenantProfile.settings?.upi_id ?? prev.upi_id,
        upi_enabled: tenantProfile.upi_enabled ?? tenantProfile.settings?.upi_enabled ?? prev.upi_enabled,
        expiry_alert_days: tenantProfile.expiry_alert_days ?? tenantProfile.settings?.expiry_alert_days ?? prev.expiry_alert_days,
        fiscal_year_start_month: tenantProfile.fiscal_year_start_month ?? tenantProfile.settings?.fiscal_year_start_month ?? prev.fiscal_year_start_month,
      }));
    }
  }, [tenantProfile]);

  function set<K extends keyof OperationsSettings>(key: K, val: OperationsSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: val }));
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await Promise.all([
        apiClient.patch('/api/auth/tenant/profile', {
          timezone: settings.timezone,
          currency: settings.currency,
          locale: settings.locale,
        }),
        apiClient.patch('/api/auth/tenant/settings', {
          cash_variance_threshold: settings.cash_variance_threshold,
          food_cost_target_pct: settings.food_cost_target_pct,
          labor_cost_target_pct: settings.labor_cost_target_pct,
          prime_cost_target_pct: settings.prime_cost_target_pct,
          upi_id: settings.upi_id,
          upi_enabled: settings.upi_enabled,
          expiry_alert_days: settings.expiry_alert_days,
          fiscal_year_start_month: settings.fiscal_year_start_month,
        }),
      ]);
      setSavedKey(k => k + 1);
    } catch {
      showToast('Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const filteredTimezones = TIMEZONES.filter(tz =>
    tz.toLowerCase().includes(tzSearch.toLowerCase())
  );

  const currencySymbol = settings.currency === 'INR' ? '₹' : settings.currency === 'USD' ? '$' : settings.currency === 'GBP' ? '£' : settings.currency === 'EUR' ? '€' : settings.currency === 'AED' ? 'AED ' : '';

  return (
    <div className="max-w-2xl space-y-8">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <h1 className="text-2xl font-bold text-gray-900">Operations Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure your restaurant&apos;s regional and operational preferences.
        </p>
      </motion.div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Regional */}
        <motion.div
          className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05, ease: 'easeOut' }}
        >
          <SectionHeading icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          }>
            Regional
          </SectionHeading>

          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search timezone..."
                value={tzSearch || settings.timezone}
                onFocus={() => setTzSearch('')}
                onBlur={() => setTzSearch('')}
                onChange={e => setTzSearch(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-shadow"
              />
              <AnimatePresence>
                {tzSearch && (
                  <motion.div
                    className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                  >
                    {filteredTimezones.map(tz => (
                      <button
                        key={tz}
                        type="button"
                        onMouseDown={() => { set('timezone', tz); setTzSearch(''); }}
                        className="w-full text-left text-sm px-3 py-2 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                      >
                        {tz}
                      </button>
                    ))}
                    {filteredTimezones.length === 0 && (
                      <p className="px-3 py-2 text-sm text-gray-400">No timezones found.</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={settings.currency} onValueChange={(v: string) => set('currency', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR — Indian Rupee (₹)</SelectItem>
                  <SelectItem value="USD">USD — US Dollar ($)</SelectItem>
                  <SelectItem value="GBP">GBP — British Pound (£)</SelectItem>
                  <SelectItem value="EUR">EUR — Euro (€)</SelectItem>
                  <SelectItem value="AED">AED — UAE Dirham</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Locale</Label>
              <Select value={settings.locale} onValueChange={(v: string) => set('locale', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-IN">en-IN (English, India)</SelectItem>
                  <SelectItem value="en-US">en-US (English, USA)</SelectItem>
                  <SelectItem value="en-GB">en-GB (English, UK)</SelectItem>
                  <SelectItem value="hi-IN">hi-IN (Hindi, India)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Fiscal Year Start Month</Label>
              <Select
                value={String(settings.fiscal_year_start_month)}
                onValueChange={(v: string) => set('fiscal_year_start_month', Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiryDays">Expiry Alert (days before)</Label>
              <Input
                id="expiryDays"
                type="number"
                min={1}
                max={90}
                value={settings.expiry_alert_days}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('expiry_alert_days', Number(e.target.value))}
              />
            </div>
          </div>
        </motion.div>

        {/* Finance targets */}
        <motion.div
          className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1, ease: 'easeOut' }}
        >
          <SectionHeading icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          }>
            Finance Targets
          </SectionHeading>

          <div className="space-y-1.5">
            <Label htmlFor="cashThreshold">
              Cash Variance Threshold ({currencySymbol})
            </Label>
            <Input
              id="cashThreshold"
              type="number"
              min={0}
              step={50}
              value={settings.cash_variance_threshold}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('cash_variance_threshold', Number(e.target.value))}
            />
            <p className="text-xs text-gray-400">
              Variances above this amount will be flagged as warnings.
            </p>
          </div>

          <Separator />

          <div className="space-y-6">
            <PercentInput
              label="Food Cost Target %"
              value={settings.food_cost_target_pct}
              onChange={v => set('food_cost_target_pct', v)}
              goodThreshold={30}
            />
            <PercentInput
              label="Labor Cost Target %"
              value={settings.labor_cost_target_pct}
              onChange={v => set('labor_cost_target_pct', v)}
              goodThreshold={30}
            />
            <PercentInput
              label="Prime Cost Target % (Food + Labor)"
              value={settings.prime_cost_target_pct}
              onChange={v => set('prime_cost_target_pct', v)}
              goodThreshold={60}
            />
          </div>
        </motion.div>

        {/* UPI */}
        <motion.div
          className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15, ease: 'easeOut' }}
        >
          <div className="flex items-center justify-between">
            <SectionHeading icon={
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            }>
              UPI Payments
            </SectionHeading>
            <Toggle
              checked={settings.upi_enabled}
              onChange={() => set('upi_enabled', !settings.upi_enabled)}
              ariaLabel="Toggle UPI"
            />
          </div>

          <AnimatePresence>
            {settings.upi_enabled && (
              <motion.div
                className="space-y-1.5"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Label htmlFor="upiId">UPI ID</Label>
                <Input
                  id="upiId"
                  value={settings.upi_id}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('upi_id', e.target.value)}
                  placeholder="yourrestaurant@bank"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Save */}
        <div className="flex justify-end">
          <SaveButton saving={saving} savedKey={savedKey} />
        </div>
      </form>
    </div>
  );
}

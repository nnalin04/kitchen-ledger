'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RestaurantType = 'cafe' | 'full_service' | 'qsr' | 'food_truck';
type InviteRole = 'manager' | 'kitchen_staff';

interface SetupData {
  restaurantName: string;
  restaurantType: RestaurantType;
  timezone: string;
  currency: string;
  openTime: string;
  closeTime: string;
  dayOverrides: Record<string, { open: string; close: string; closed: boolean }>;
  menuTemplate: 'upload' | RestaurantType;
  inviteEmail: string;
  inviteRole: InviteRole;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = ['Restaurant', 'Hours', 'Menu', 'Invite Staff', 'Get Started'];

const RESTAURANT_TYPES: { value: RestaurantType; label: string }[] = [
  { value: 'cafe', label: 'Cafe / Coffee Shop' },
  { value: 'full_service', label: 'Full Service Restaurant' },
  { value: 'qsr', label: 'QSR / Fast Casual' },
  { value: 'food_truck', label: 'Food Truck' },
];

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST, UTC+5:30)' },
  { value: 'America/New_York', label: 'US Eastern (EST/EDT)' },
  { value: 'America/Chicago', label: 'US Central (CST/CDT)' },
  { value: 'America/Denver', label: 'US Mountain (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PST/PDT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST, UTC+4)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

const CURRENCIES = [
  { value: 'INR', label: 'INR — Indian Rupee (₹)' },
  { value: 'USD', label: 'USD — US Dollar ($)' },
  { value: 'GBP', label: 'GBP — British Pound (£)' },
  { value: 'EUR', label: 'EUR — Euro (€)' },
  { value: 'AED', label: 'AED — UAE Dirham (د.إ)' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Helper to get stored access token
// ---------------------------------------------------------------------------

function getAccessToken(): string | null {
  try {
    const raw = localStorage.getItem('kl-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { accessToken?: string } };
    return parsed?.state?.accessToken ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step sub-components
// ---------------------------------------------------------------------------

function RestaurantDetailsStep({
  data,
  setData,
}: {
  data: SetupData;
  setData: React.Dispatch<React.SetStateAction<SetupData>>;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Your Restaurant</h2>
      <p className="text-sm text-gray-500">Tell us a bit about your place.</p>

      <div>
        <label htmlFor="restaurantName" className="block text-sm font-medium text-gray-700 mb-1">
          Restaurant Name
        </label>
        <input
          id="restaurantName"
          type="text"
          value={data.restaurantName}
          onChange={(e) => setData((d) => ({ ...d, restaurantName: e.target.value }))}
          placeholder="The Golden Spoon"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {RESTAURANT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setData((d) => ({ ...d, restaurantType: t.value }))}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${
                data.restaurantType === t.value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
          Timezone
        </label>
        <select
          id="timezone"
          value={data.timezone}
          onChange={(e) => setData((d) => ({ ...d, timezone: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
          Currency
        </label>
        <select
          id="currency"
          value={data.currency}
          onChange={(e) => setData((d) => ({ ...d, currency: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function OperatingHoursStep({
  data,
  setData,
}: {
  data: SetupData;
  setData: React.Dispatch<React.SetStateAction<SetupData>>;
}) {
  const getDay = (day: string) =>
    data.dayOverrides[day] ?? { open: data.openTime, close: data.closeTime, closed: false };

  const updateDay = (
    day: string,
    field: 'open' | 'close' | 'closed',
    value: string | boolean,
  ) => {
    setData((d) => ({
      ...d,
      dayOverrides: {
        ...d.dayOverrides,
        [day]: { ...getDay(day), [field]: value },
      },
    }));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Operating Hours</h2>
      <p className="text-sm text-gray-500">Set your default hours — you can always change these later.</p>

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="openTime" className="block text-xs font-medium text-gray-500 mb-1">
            Default open
          </label>
          <input
            id="openTime"
            type="time"
            value={data.openTime}
            onChange={(e) => setData((d) => ({ ...d, openTime: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="closeTime" className="block text-xs font-medium text-gray-500 mb-1">
            Default close
          </label>
          <input
            id="closeTime"
            type="time"
            value={data.closeTime}
            onChange={(e) => setData((d) => ({ ...d, closeTime: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <p className="text-xs text-gray-400">Override per day (optional):</p>

      <div className="space-y-2">
        {DAYS.map((day) => {
          const override = getDay(day);
          return (
            <div key={day} className="flex items-center gap-2">
              <span className="w-8 text-xs font-medium text-gray-600">{day}</span>
              <input
                type="time"
                value={override.closed ? '' : override.open}
                disabled={override.closed}
                onChange={(e) => updateDay(day, 'open', e.target.value)}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="time"
                value={override.closed ? '' : override.close}
                disabled={override.closed}
                onChange={(e) => updateDay(day, 'close', e.target.value)}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
              />
              <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={override.closed}
                  onChange={(e) => updateDay(day, 'closed', e.target.checked)}
                  className="rounded"
                />
                Closed
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MenuTemplateStep({
  data,
  setData,
}: {
  data: SetupData;
  setData: React.Dispatch<React.SetStateAction<SetupData>>;
}) {
  const options: { value: SetupData['menuTemplate']; label: string; description: string }[] = [
    {
      value: 'upload',
      label: 'Upload menu PDF',
      description: 'Digitize your existing menu with AI-powered OCR.',
    },
    {
      value: 'cafe',
      label: 'Cafe template',
      description: 'Coffees, pastries, light meals — ready to customize.',
    },
    {
      value: 'full_service',
      label: 'Full-service template',
      description: 'Starters, mains, desserts, beverages.',
    },
    {
      value: 'qsr',
      label: 'QSR / Fast casual template',
      description: 'Combos, sides, drinks — optimized for speed.',
    },
    {
      value: 'food_truck',
      label: 'Food truck template',
      description: 'Compact, focused menu with daily specials.',
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Menu Setup</h2>
      <p className="text-sm text-gray-500">How would you like to set up your menu?</p>
      <div className="space-y-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setData((d) => ({ ...d, menuTemplate: opt.value }))}
            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
              data.menuTemplate === opt.value
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                data.menuTemplate === opt.value ? 'text-blue-700' : 'text-gray-800'
              }`}
            >
              {opt.label}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function InviteStaffStep({
  data,
  setData,
}: {
  data: SetupData;
  setData: React.Dispatch<React.SetStateAction<SetupData>>;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Invite Your First Team Member</h2>
      <p className="text-sm text-gray-500">
        Optional — you can always invite more staff later from Settings.
      </p>

      <div>
        <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-700 mb-1">
          Email Address
        </label>
        <input
          id="inviteEmail"
          type="email"
          value={data.inviteEmail}
          onChange={(e) => setData((d) => ({ ...d, inviteEmail: e.target.value }))}
          placeholder="manager@restaurant.com"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="inviteRole" className="block text-sm font-medium text-gray-700 mb-1">
          Role
        </label>
        <select
          id="inviteRole"
          value={data.inviteRole}
          onChange={(e) => setData((d) => ({ ...d, inviteRole: e.target.value as InviteRole }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="manager">Manager — full access except billing</option>
          <option value="kitchen_staff">Kitchen Staff — inventory and tasks only</option>
        </select>
      </div>
    </div>
  );
}

function FirstActionStep({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <div className="space-y-6 text-center">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">You&apos;re all set!</h2>
        <p className="text-gray-500 mt-2 text-sm">What would you like to do first?</p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => router.replace('/finance/daily-reports/today')}
          className="w-full px-6 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-left"
        >
          <p className="font-semibold text-base">Log today&apos;s sales</p>
          <p className="text-blue-200 text-sm mt-0.5">Record revenue and reconcile your cash drawer</p>
        </button>

        <button
          type="button"
          onClick={() => router.replace('/inventory/counts/new')}
          className="w-full px-6 py-4 bg-white border-2 border-blue-600 text-blue-600 rounded-xl hover:bg-blue-50 transition-colors text-left"
        >
          <p className="font-semibold text-base">Do a stock count</p>
          <p className="text-blue-500 text-sm mt-0.5">Take inventory and set par levels</p>
        </button>
      </div>

      <button
        type="button"
        onClick={() => router.replace('/')}
        className="text-sm text-gray-400 hover:text-gray-600 hover:underline"
      >
        Go to dashboard
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard page
// ---------------------------------------------------------------------------

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [data, setData] = useState<SetupData>({
    restaurantName: '',
    restaurantType: 'full_service',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    openTime: '10:00',
    closeTime: '23:00',
    dayOverrides: {},
    menuTemplate: 'full_service',
    inviteEmail: '',
    inviteRole: 'kitchen_staff',
  });

  // Persist settings after step 3 (before step 4)
  const persistSettings = async () => {
    const token = getAccessToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const operatingHours = DAYS.map((day) => {
      const override = data.dayOverrides[day];
      return {
        day,
        open: override?.open ?? data.openTime,
        close: override?.close ?? data.closeTime,
        closed: override?.closed ?? false,
      };
    });

    await Promise.all([
      axios.patch(`${API_URL}/api/auth/tenant/profile`, {
        name: data.restaurantName,
        type: data.restaurantType,
      }, { headers }),
      axios.patch(`${API_URL}/api/auth/tenant/settings`, {
        timezone: data.timezone,
        currency: data.currency,
        operatingHours,
      }, { headers }),
    ]);
  };

  const sendInvite = async () => {
    if (!data.inviteEmail) return;
    const token = getAccessToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    await axios.post(
      `${API_URL}/api/auth/users/invite`,
      { email: data.inviteEmail, role: data.inviteRole },
      { headers },
    );
  };

  const handleNext = async () => {
    setSaveError('');

    // On step 3 (Invite Staff → Get Started): persist profile + settings, optionally send invite
    if (step === 3) {
      setSaving(true);
      try {
        await persistSettings();
        await sendInvite();
      } catch {
        // Non-fatal: log and continue — user can fix settings later
        setSaveError('Settings saved partially. You can update them in Settings later.');
      } finally {
        setSaving(false);
      }
    }

    setStep((s) => s + 1);
  };

  return (
    <div className="w-full max-w-lg p-8 bg-white rounded-2xl shadow-lg">
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step
                  ? 'bg-blue-600 text-white'
                  : i === step
                  ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                  : 'bg-gray-200 text-gray-400'
              }`}
              aria-current={i === step ? 'step' : undefined}
              title={label}
            >
              {i < step ? (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-6 transition-colors ${i < step ? 'bg-blue-600' : 'bg-gray-200'}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step label */}
      <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-4">
        Step {step + 1} of {STEPS.length} — {STEPS[step]}
      </p>

      {/* Step content */}
      {step === 0 && <RestaurantDetailsStep data={data} setData={setData} />}
      {step === 1 && <OperatingHoursStep data={data} setData={setData} />}
      {step === 2 && <MenuTemplateStep data={data} setData={setData} />}
      {step === 3 && <InviteStaffStep data={data} setData={setData} />}
      {step === 4 && <FirstActionStep router={router} />}

      {/* Save error banner */}
      {saveError && (
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg" role="alert">
          {saveError}
        </p>
      )}

      {/* Navigation */}
      {step < 4 && (
        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleNext}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : step === 3 ? 'Finish setup' : 'Next'}
          </button>
        </div>
      )}
    </div>
  );
}

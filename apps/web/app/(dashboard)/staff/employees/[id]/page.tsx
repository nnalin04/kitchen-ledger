'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { staffApi } from '@/lib/api/staff.api';

// ─── helpers ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  kitchen_staff: 'bg-green-100 text-green-700',
  server: 'bg-orange-100 text-orange-700',
};

const ROLE_DOT: Record<string, string> = {
  owner: 'bg-purple-500',
  manager: 'bg-blue-500',
  kitchen_staff: 'bg-green-500',
  server: 'bg-orange-500',
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  kitchen_staff: 'Kitchen Staff',
  server: 'Server',
};

function fmt(time?: string) {
  return time ? time.slice(0, 5) : '—';
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function shiftStatusClass(status: string) {
  if (status === 'completed') return 'bg-green-100 text-green-700';
  if (status === 'cancelled') return 'bg-red-100 text-red-500';
  return 'bg-blue-100 text-blue-700';
}

function shiftStatusDot(status: string) {
  if (status === 'completed') return 'bg-green-500';
  if (status === 'cancelled') return 'bg-red-500';
  return 'bg-blue-500';
}

function attendanceStatusClass(status: string) {
  if (status === 'present') return 'bg-green-100 text-green-700';
  if (status === 'late') return 'bg-yellow-100 text-yellow-700';
  if (status === 'absent') return 'bg-red-100 text-red-600';
  return 'bg-gray-100 text-gray-500';
}

function attendanceStatusDot(status: string) {
  if (status === 'present') return 'bg-green-500';
  if (status === 'late') return 'bg-yellow-500';
  if (status === 'absent') return 'bg-red-500';
  return 'bg-gray-400';
}

function isPastExpiry(date?: string) {
  if (!date) return false;
  return new Date(date) < new Date();
}

// group attendance records by ISO week label "Wk Jan 13" etc.
function groupByWeek(records: any[]): { week: string; hours: number }[] {
  const map: Record<string, number> = {};
  for (const r of records) {
    const d = new Date(r.date ?? r.clockIn ?? r.clock_in ?? '');
    if (isNaN(d.getTime())) continue;
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const label = monday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    map[label] = (map[label] ?? 0) + (Number(r.hoursWorked ?? r.hours_worked) || 0);
  }
  return Object.entries(map).map(([week, hours]) => ({ week, hours: Math.round(hours * 10) / 10 }));
}

// ─── Bar gradient definition ─────────────────────────────────────────────────

function BarGradientDef() {
  return (
    <defs>
      <linearGradient id="blueBarGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
        <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.85} />
      </linearGradient>
    </defs>
  );
}

// ─── Add Certification Sheet ─────────────────────────────────────────────────

interface CertFormData {
  certName: string;
  issuedBy: string;
  expiryDate: string;
}

function AddCertSheet({
  employeeId,
  onClose,
  onSuccess,
}: {
  employeeId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<CertFormData>({ certName: '', issuedBy: '', expiryDate: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await staffApi.certifications.create({ ...form, employeeId });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to add certification');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <motion.div
          className="absolute inset-0 bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <motion.div
          className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 shadow-2xl z-10"
          initial={{ opacity: 0, scale: 0.97, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 16 }}
          transition={{ duration: 0.18 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Add Certification</h2>
            <motion.button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              &times;
            </motion.button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Certification Name *</label>
              <input
                required
                value={form.certName}
                onChange={e => setForm(f => ({ ...f, certName: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                placeholder="e.g. Food Safety Level 2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Issued By *</label>
              <input
                required
                value={form.issuedBy}
                onChange={e => setForm(f => ({ ...f, issuedBy: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                placeholder="e.g. FSSAI"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <motion.button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                {saving ? 'Saving…' : 'Add Certification'}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type Tab = 'overview' | 'shifts' | 'attendance' | 'certifications';

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showCertSheet, setShowCertSheet] = useState(false);

  // Date range: last 4 weeks
  const today = new Date();
  const fourWeeksAgo = new Date(today);
  fourWeeksAgo.setDate(today.getDate() - 28);
  const fromStr = fourWeeksAgo.toISOString().split('T')[0];
  const toStr = today.toISOString().split('T')[0];

  const { data: empData, isLoading: empLoading } = useSWR(
    id ? `employee-${id}` : null,
    () => staffApi.employees.getById(id)
  );

  const { data: shiftsData, isLoading: shiftsLoading } = useSWR(
    id && activeTab === 'shifts' ? `shifts-${id}-${fromStr}-${toStr}` : null,
    () => staffApi.shifts.listByEmployee(id, fromStr, toStr)
  );

  const { data: attendanceData, isLoading: attendanceLoading } = useSWR(
    id && activeTab === 'attendance' ? `attendance-${id}` : null,
    () => staffApi.attendance.listByEmployee(id)
  );

  const { data: certsData, isLoading: certsLoading, mutate: mutateCerts } = useSWR(
    id && activeTab === 'certifications' ? `certs-${id}` : null,
    () => staffApi.certifications.list(id)
  );

  const employee = empData?.data ?? empData;
  const shifts: any[] = Array.isArray(shiftsData?.data) ? shiftsData.data : (Array.isArray(shiftsData) ? shiftsData : []);
  const attendance: any[] = Array.isArray(attendanceData?.data) ? attendanceData.data : (Array.isArray(attendanceData) ? attendanceData : []);
  const certs: any[] = Array.isArray(certsData?.data) ? certsData.data : (Array.isArray(certsData) ? certsData : []);

  const weeklyHours = groupByWeek(attendance);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'shifts', label: 'Shifts' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'certifications', label: 'Certifications' },
  ];

  if (empLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-100 rounded w-48" />
        <div className="h-28 bg-gray-100 rounded-xl" />
        <div className="h-10 bg-gray-100 rounded-xl w-2/3" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (!employee) {
    return (
      <motion.div
        className="text-center py-24 text-gray-400"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
        </svg>
        <p className="text-lg font-medium">Employee not found</p>
        <motion.button
          onClick={() => router.back()}
          className="mt-3 text-sm text-blue-600 hover:underline"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          Go back
        </motion.button>
      </motion.div>
    );
  }

  const isActive = employee.status !== 'inactive' && !employee.deletedAt;

  return (
    <div className="space-y-4">
      {/* Back */}
      <motion.button
        onClick={() => router.back()}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
        whileHover={{ x: -2 }}
        whileTap={{ scale: 0.97 }}
      >
        ← Back to Employees
      </motion.button>

      {/* Header card — slides in from left */}
      <motion.div
        className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5"
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <motion.div
              className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold text-xl shadow-sm"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.08, type: 'spring', stiffness: 220 }}
            >
              {(employee.fullName ?? '?').charAt(0).toUpperCase()}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12, duration: 0.22 }}
            >
              <h1 className="text-2xl font-bold text-gray-900">{employee.fullName ?? '—'}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    ROLE_BADGE[employee.role] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${ROLE_DOT[employee.role] ?? 'bg-gray-400'}`} />
                  {ROLE_LABEL[employee.role] ?? employee.role ?? '—'}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </motion.div>
          </div>
          <motion.div
            className="flex flex-wrap gap-6 text-sm text-gray-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.2 }}
          >
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Hire Date</p>
              <p className="font-medium text-gray-800 mt-0.5">{fmtDate(employee.hireDate ?? employee.hire_date)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Hourly Rate</p>
              <p className="font-semibold tabular-nums text-gray-800 mt-0.5">
                {employee.hourlyRate != null ? `₹${Number(employee.hourlyRate).toFixed(2)}/hr` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Employment</p>
              <p className="font-medium text-gray-800 mt-0.5 capitalize">
                {(employee.employmentType ?? employee.employment_type ?? '—').replace('_', ' ')}
              </p>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div
        className="flex gap-1 border-b border-gray-200"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.2 }}
      >
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </motion.div>

      {/* Tab content — re-animates on tab switch via key */}
      <AnimatePresence mode="wait">
        {/* ── Tab: Overview ── */}
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <h2 className="font-semibold text-gray-800 text-base">Employee Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {[
                { label: 'Full Name', value: employee.fullName },
                { label: 'Role', value: ROLE_LABEL[employee.role] ?? employee.role },
                { label: 'Employment Type', value: (employee.employmentType ?? employee.employment_type ?? '').replace('_', ' ') },
                { label: 'Hourly Rate', value: employee.hourlyRate != null ? `₹${Number(employee.hourlyRate).toFixed(2)}` : undefined },
                { label: 'Email', value: employee.email },
                { label: 'Phone', value: employee.phone },
                { label: 'Hire Date', value: fmtDate(employee.hireDate ?? employee.hire_date) },
                { label: 'Status', value: isActive ? 'Active' : 'Inactive' },
              ].map((row, i) => (
                <motion.div
                  key={row.label}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.18 }}
                >
                  <InfoRow label={row.label} value={row.value} />
                </motion.div>
              ))}
            </div>

            {(employee.emergencyContactName ?? employee.emergency_contact_name) && (
              <>
                <hr className="border-gray-100" />
                <h3 className="font-semibold text-gray-700 text-sm">Emergency Contact</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <InfoRow label="Name" value={employee.emergencyContactName ?? employee.emergency_contact_name} />
                  <InfoRow label="Phone" value={employee.emergencyContactPhone ?? employee.emergency_contact_phone} />
                </div>
              </>
            )}

            {employee.availability && (
              <>
                <hr className="border-gray-100" />
                <h3 className="font-semibold text-gray-700 text-sm">Availability</h3>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{employee.availability}</p>
              </>
            )}

            {employee.notes && (
              <>
                <hr className="border-gray-100" />
                <h3 className="font-semibold text-gray-700 text-sm">Notes</h3>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{employee.notes}</p>
              </>
            )}
          </motion.div>
        )}

        {/* ── Tab: Shifts ── */}
        {activeTab === 'shifts' && (
          <motion.div
            key="shifts"
            className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Shifts — Last 4 Weeks</h2>
              <p className="text-xs text-gray-400 mt-0.5">{fromStr} to {toStr}</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Station</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {shiftsLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-100 animate-pulse">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : shifts.length === 0
                  ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
                          <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="font-medium text-sm">No shifts in the last 4 weeks</p>
                        </div>
                      </td>
                    </tr>
                  )
                  : shifts.map((shift: any, i: number) => (
                    <motion.tr
                      key={shift.id}
                      className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors group"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.2 }}
                    >
                      <td className="px-4 py-3 text-gray-700 group-hover:border-l-2 group-hover:border-blue-400 transition-all">{fmtDate(shift.shiftDate ?? shift.shift_date)}</td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                        {fmt(shift.startTime ?? shift.start_time)}–{fmt(shift.endTime ?? shift.end_time)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 capitalize">
                        {(shift.roleLabel ?? shift.role ?? '—').replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{shift.station ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${shiftStatusClass(shift.status ?? 'scheduled')}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${shiftStatusDot(shift.status ?? 'scheduled')}`} />
                          {shift.status ?? 'scheduled'}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
              </tbody>
            </table>
          </motion.div>
        )}

        {/* ── Tab: Attendance ── */}
        {activeTab === 'attendance' && (
          <motion.div
            key="attendance"
            className="space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {/* Weekly hours chart */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5">
              <h2 className="font-semibold text-gray-800 mb-4">Weekly Hours</h2>
              {attendanceLoading ? (
                <div className="h-48 bg-gray-50 animate-pulse rounded-lg" />
              ) : weeklyHours.length === 0 ? (
                <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
                  <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="font-medium text-sm">No attendance data available</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weeklyHours} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <BarGradientDef />
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="h" />
                    <Tooltip
                      formatter={(v: any) => [`${v}h`, 'Hours Worked']}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    />
                    <Bar dataKey="hours" fill="url(#blueBarGrad)" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Attendance log table */}
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Attendance Log</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Clock In</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Clock Out</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Hours</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b border-gray-100 animate-pulse">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j} className="px-4 py-3">
                              <div className="h-4 bg-gray-100 rounded" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : attendance.length === 0
                    ? (
                      <tr>
                        <td colSpan={5}>
                          <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
                            <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="font-medium text-sm">No attendance records</p>
                          </div>
                        </td>
                      </tr>
                    )
                    : attendance.map((rec: any, i: number) => (
                      <motion.tr
                        key={rec.id}
                        className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.2 }}
                      >
                        <td className="px-4 py-3 text-gray-700">{fmtDate(rec.date)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {fmt(rec.clockIn ?? rec.clock_in)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {fmt(rec.clockOut ?? rec.clock_out)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-700">
                          {rec.hoursWorked ?? rec.hours_worked
                            ? `${Number(rec.hoursWorked ?? rec.hours_worked).toFixed(1)}h`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${attendanceStatusClass(rec.status ?? 'present')}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${attendanceStatusDot(rec.status ?? 'present')}`} />
                            {rec.status ?? 'present'}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* ── Tab: Certifications ── */}
        {activeTab === 'certifications' && (
          <motion.div
            key="certifications"
            className="space-y-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Certifications</h2>
              <motion.button
                onClick={() => setShowCertSheet(true)}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-medium shadow-sm"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                + Add Certification
              </motion.button>
            </div>

            {certsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : certs.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-gray-400 bg-white rounded-xl border border-gray-200">
                <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="font-medium text-sm">No certifications on file</p>
                <p className="text-xs">Add certifications to track food safety and other qualifications</p>
              </div>
            ) : (
              <div className="space-y-2">
                {certs.map((cert: any, i: number) => {
                  const expired = isPastExpiry(cert.expiryDate ?? cert.expiry_date);
                  return (
                    <motion.div
                      key={cert.id}
                      className="bg-white rounded-xl border border-gray-200/80 shadow-sm px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                      initial={{ opacity: 0, x: -8 }}
                      animate={
                        expired
                          ? { opacity: 1, x: [0, -3, 3, -3, 3, 0] }
                          : { opacity: 1, x: 0 }
                      }
                      transition={
                        expired
                          ? { delay: i * 0.06, duration: 0.4, x: { delay: i * 0.06 + 0.1, duration: 0.35 } }
                          : { delay: i * 0.06, duration: 0.2 }
                      }
                    >
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{cert.certName ?? cert.cert_name ?? cert.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Issued by {cert.issuedBy ?? cert.issued_by ?? '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs text-gray-500">
                          <p>Expiry</p>
                          <p className="font-semibold tabular-nums text-gray-700">
                            {fmtDate(cert.expiryDate ?? cert.expiry_date)}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            expired ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${expired ? 'bg-red-500' : 'bg-green-500'}`} />
                          {expired ? 'Expired' : 'Valid'}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cert sheet overlay */}
      {showCertSheet && (
        <AddCertSheet
          employeeId={id}
          onClose={() => setShowCertSheet(false)}
          onSuccess={() => mutateCerts()}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      <span className="text-gray-800 font-medium capitalize">{value ?? '—'}</span>
    </div>
  );
}

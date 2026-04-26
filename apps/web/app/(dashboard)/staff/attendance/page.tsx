'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'motion/react';
import { staffApi } from '@/lib/api/staff.api';

// ─── helpers ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function fmtShort(d: Date) {
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function statusClass(status: string) {
  if (status === 'present') return 'bg-green-100 text-green-700';
  if (status === 'late') return 'bg-yellow-100 text-yellow-700';
  if (status === 'absent') return 'bg-red-100 text-red-600';
  return 'bg-gray-100 text-gray-400';
}

function statusDot(status: string) {
  if (status === 'present') return 'bg-green-500';
  if (status === 'late') return 'bg-yellow-500';
  if (status === 'absent') return 'bg-red-500';
  return 'bg-gray-300';
}

function statusLabel(status: string) {
  if (status === 'present') return 'P';
  if (status === 'late') return 'L';
  if (status === 'absent') return 'A';
  return 'Off';
}

// Build lookup: employeeId → dateStr → record
function buildLookup(records: any[]): Record<string, Record<string, any>> {
  const map: Record<string, Record<string, any>> = {};
  for (const r of records) {
    const empId = r.employeeId ?? r.employee_id ?? r.employee?.id;
    const dateStr = r.date ?? r.clockIn?.slice(0, 10) ?? r.clock_in?.slice(0, 10);
    if (!empId || !dateStr) continue;
    if (!map[empId]) map[empId] = {};
    map[empId][dateStr] = r;
  }
  return map;
}

// Collect unique employees from attendance records
function extractEmployees(records: any[]): { id: string; name: string }[] {
  const seen = new Set<string>();
  const list: { id: string; name: string }[] = [];
  for (const r of records) {
    const id = r.employeeId ?? r.employee_id ?? r.employee?.id;
    const name = r.employeeName ?? r.employee_name ?? r.employee?.fullName ?? r.employee?.name ?? 'Unknown';
    if (id && !seen.has(id)) {
      seen.add(id);
      list.push({ id, name });
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div
          className="absolute inset-0 bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        />
        <motion.div
          className="relative bg-white rounded-2xl p-6 shadow-2xl z-10 max-w-sm w-full mx-4"
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18 }}
        >
          <h3 className="font-bold text-gray-900 text-base mb-2">Confirm Approval</h3>
          <p className="text-sm text-gray-600 mb-5">{message}</p>
          <div className="flex justify-end gap-3">
            <motion.button
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              whileTap={{ scale: 0.97 }}
            >
              Cancel
            </motion.button>
            <motion.button
              onClick={onConfirm}
              disabled={loading}
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              {loading ? 'Approving…' : 'Approve'}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [showConfirm, setShowConfirm] = useState(false);
  const [approving, setApproving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const weekStartStr = toDateStr(weekStart);
  const weekDays = getWeekDays(weekStart);

  const { data, isLoading } = useSWR(
    `attendance-week-${weekStartStr}`,
    () => staffApi.attendance.listByWeek(weekStartStr)
  );

  const records: any[] = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
  const lookup = buildLookup(records);
  const employees = extractEmployees(records);

  function prevWeek() {
    setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  }
  function nextWeek() {
    setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await staffApi.attendance.approve(weekStartStr);
      setToast({ msg: 'Timesheet approved successfully', ok: true });
    } catch {
      setToast({ msg: 'Failed to approve timesheet', ok: false });
    } finally {
      setApproving(false);
      setShowConfirm(false);
      setTimeout(() => setToast(null), 3500);
    }
  }

  function downloadCSV() {
    const headers = ['Employee', ...weekDays.map(d => `${DAY_NAMES[weekDays.indexOf(d)]} ${fmtShort(d)}`)];
    const rows = employees.map(emp => {
      const cells = weekDays.map(day => {
        const rec = lookup[emp.id]?.[toDateStr(day)];
        if (!rec) return 'Off';
        const hrs = rec.hoursWorked ?? rec.hours_worked ?? 0;
        return `${Number(hrs).toFixed(1)}h (${rec.status ?? 'present'})`;
      });
      return [emp.name, ...cells];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${weekStartStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <motion.button
            onClick={prevWeek}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
          >
            ← Prev
          </motion.button>
          <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
            {fmtShort(weekStart)} — {fmtShort(weekDays[6])}, {weekDays[6].getFullYear()}
          </span>
          <motion.button
            onClick={nextWeek}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
          >
            Next →
          </motion.button>
          <motion.button
            onClick={downloadCSV}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
          >
            Download CSV
          </motion.button>
          <motion.button
            onClick={() => setShowConfirm(true)}
            className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-lg shadow-sm"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Approve Timesheet
          </motion.button>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.p
            className={`text-sm px-4 py-2 rounded-lg ${
              toast.ok
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {toast.msg}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Matrix grid */}
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-x-auto">
        <div className="min-w-[720px]">
          {/* Header row */}
          <div
            className="grid border-b bg-gray-50 text-xs font-medium text-gray-500"
            style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}
          >
            <div className="px-4 py-3 border-r border-gray-200 text-gray-600 font-semibold">Employee</div>
            {weekDays.map((day, i) => {
              const isToday = toDateStr(day) === toDateStr(new Date());
              return (
                <div
                  key={i}
                  className={`px-2 py-3 text-center border-r border-gray-200 last:border-r-0 ${
                    isToday ? 'bg-blue-50 text-blue-600' : ''
                  }`}
                >
                  <div className="font-semibold">{DAY_NAMES[i]}</div>
                  <div className={`text-base font-bold mt-0.5 ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="grid border-b border-gray-100 animate-pulse"
                  style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}
                >
                  <div className="px-4 py-3 border-r border-gray-100">
                    <div className="h-4 bg-gray-100 rounded w-28" />
                  </div>
                  {weekDays.map((_, j) => (
                    <div key={j} className="p-2 border-r border-gray-100 last:border-r-0">
                      <div className="h-10 bg-gray-50 rounded" />
                    </div>
                  ))}
                </div>
              ))
            : employees.length === 0
            ? (
              <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
                <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
                </svg>
                <p className="font-medium text-sm">No attendance records for this week</p>
                <p className="text-xs">Records will appear once staff clock in</p>
              </div>
            )
            : employees.map((emp, rowIdx) => (
                <motion.div
                  key={emp.id}
                  className="grid border-b border-gray-100 hover:bg-blue-50/30 transition-colors"
                  style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: rowIdx * 0.04, duration: 0.2 }}
                >
                  <div className="px-4 py-3 text-sm font-medium text-gray-800 border-r border-gray-100 flex items-center truncate">
                    {emp.name}
                  </div>
                  {weekDays.map((day, di) => {
                    const rec = lookup[emp.id]?.[toDateStr(day)];
                    const hrs = rec ? Number(rec.hoursWorked ?? rec.hours_worked ?? 0) : 0;
                    const status = rec?.status ?? (rec ? 'present' : 'off');
                    const overtime = hrs > 8;
                    return (
                      <motion.div
                        key={di}
                        className={`p-1.5 border-r border-gray-100 last:border-r-0 ${
                          overtime ? 'bg-orange-50' : ''
                        }`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: di * 0.03 + rowIdx * 0.02, duration: 0.18 }}
                      >
                        {rec ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs font-semibold tabular-nums text-gray-700">
                              {hrs.toFixed(1)}h
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold ${statusClass(status)}`}
                            >
                              <span className={`w-1 h-1 rounded-full ${statusDot(status)}`} />
                              {statusLabel(status)}
                            </span>
                            {overtime && (
                              <motion.span
                                className="text-xs font-bold text-orange-600"
                                animate={{ opacity: [1, 0.65, 1] }}
                                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                              >
                                OT
                              </motion.span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full min-h-10">
                            <span className="text-xs text-gray-300">—</span>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </motion.div>
              ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-200 inline-block" />
          Present (P)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-yellow-200 inline-block" />
          Late (L)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-200 inline-block" />
          Absent (A)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-orange-200 inline-block" />
          Overtime (&gt;8h)
        </span>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <ConfirmDialog
          message={`Approve all timesheets for the week of ${fmtShort(weekStart)}? This action cannot be undone.`}
          onConfirm={handleApprove}
          onCancel={() => setShowConfirm(false)}
          loading={approving}
        />
      )}
    </motion.div>
  );
}

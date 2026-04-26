'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { motion } from 'motion/react';
import { apiClient } from '@/lib/api/client';
import { staffApi } from '@/lib/api/staff.api';

const fetcher = (url: string) => apiClient.get(url).then(r => r.data.data);

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  kitchen_staff: 'bg-green-100 text-green-700',
  server: 'bg-orange-100 text-orange-700',
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  kitchen_staff: 'Kitchen',
  server: 'Server',
};

const EMPTY_FORM = {
  fullName: '',
  role: 'server',
  employmentType: 'full_time',
  hourlyRate: '',
  email: '',
  phone: '',
};

export default function EmployeesPage() {
  const { data, isLoading, mutate } = useSWR('/api/staff/employees', fetcher);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const employees: any[] = data ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await staffApi.employees.create({
        ...form,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined,
      });
      await mutate();
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to create employee');
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">{employees.length} total</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Employee'}
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4"
        >
          <h2 className="font-semibold text-blue-800">New Employee</h2>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                required
                value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Priya Sharma"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Role *</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="kitchen_staff">Kitchen Staff</option>
                <option value="server">Server</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Employment Type</label>
              <select
                value={form.employmentType}
                onChange={e => setForm(f => ({ ...f, employmentType: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hourly Rate (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.hourlyRate}
                onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 150.00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="employee@email.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+91 98765 43210"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(''); }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create Employee'}
            </button>
          </div>
        </form>
      )}

      {/* Employee Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Hourly Rate</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              : employees.map((emp: any, index: number) => (
                  <motion.tr
                    key={emp.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.04, duration: 0.2 }}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{emp.fullName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          ROLE_BADGE[emp.role] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {ROLE_LABEL[emp.role] ?? emp.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 capitalize">
                      {emp.employmentType?.replace('_', ' ') ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {emp.hourlyRate != null ? `₹${Number(emp.hourlyRate).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <div>{emp.email ?? '—'}</div>
                      {emp.phone && <div className="text-gray-400">{emp.phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          emp.status === 'inactive' || emp.deletedAt
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {emp.status === 'inactive' || emp.deletedAt ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                  </motion.tr>
                ))}
          </tbody>
        </table>
        {!isLoading && employees.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No employees yet</p>
            <p className="text-sm mt-1">Add your first employee to get started</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

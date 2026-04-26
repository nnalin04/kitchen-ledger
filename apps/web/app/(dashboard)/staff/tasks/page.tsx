'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'motion/react';
import { staffApi } from '@/lib/api/staff.api';

// ─── types & helpers ─────────────────────────────────────────────────────────

type Category = 'all' | 'opening' | 'closing' | 'prep' | 'safety';
type TaskStatus = 'pending' | 'completed' | 'overdue';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'opening', label: 'Opening' },
  { key: 'closing', label: 'Closing' },
  { key: 'prep', label: 'Prep' },
  { key: 'safety', label: 'Safety' },
];

const CATEGORY_COLOR: Record<string, string> = {
  opening: 'text-blue-600',
  closing: 'text-purple-600',
  prep: 'text-amber-600',
  safety: 'text-red-600',
  other: 'text-gray-600',
};

function taskStatus(task: any): TaskStatus {
  if (task.completedAt ?? task.completed_at) return 'completed';
  const dueStr = (task.dueDate ?? task.due_date) + 'T' + (task.dueTime ?? task.due_time ?? '23:59');
  if (new Date(dueStr) < new Date()) return 'overdue';
  return 'pending';
}

function statusBadgeClass(s: TaskStatus) {
  if (s === 'completed') return 'bg-green-100 text-green-700';
  if (s === 'overdue') return 'bg-red-100 text-red-700';
  return 'bg-yellow-100 text-yellow-700';
}

function statusDot(s: TaskStatus) {
  if (s === 'completed') return 'bg-green-500';
  if (s === 'overdue') return 'bg-red-500';
  return 'bg-yellow-500';
}

function fmt12(time?: string) {
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function groupByCategory(tasks: any[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  for (const t of tasks) {
    const cat = t.category ?? 'other';
    if (!map[cat]) map[cat] = [];
    map[cat].push(t);
  }
  return map;
}

// ─── Complete Notes Dialog ───────────────────────────────────────────────────

function CompleteDialog({
  task,
  onClose,
  onDone,
}: {
  task: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await staffApi.tasks.complete(task.id, { notes });
      onDone();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to complete task');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div
          className="absolute inset-0 bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <motion.div
          className="relative bg-white rounded-2xl p-6 shadow-2xl z-10 max-w-sm w-full mx-4"
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18 }}
        >
          <h3 className="font-bold text-gray-900 text-base mb-1">Mark as Completed</h3>
          <p className="text-sm text-gray-500 mb-4">{task.title}</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none transition-shadow"
                placeholder="Any notes about completion…"
              />
            </div>
            <div className="flex justify-end gap-3">
              <motion.button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                whileTap={{ scale: 0.97 }}
              >
                Cancel
              </motion.button>
              <motion.button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 shadow-sm"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                {saving ? 'Saving…' : 'Mark Complete'}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Add Task Sheet ──────────────────────────────────────────────────────────

interface TaskFormData {
  title: string;
  category: string;
  assignTo: string;
  dueDate: string;
  dueTime: string;
  requiresPhoto: boolean;
}

const EMPTY_TASK_FORM: TaskFormData = {
  title: '',
  category: 'opening',
  assignTo: '',
  dueDate: new Date().toISOString().split('T')[0],
  dueTime: '09:00',
  requiresPhoto: false,
};

function AddTaskSheet({
  employees,
  onClose,
  onSuccess,
}: {
  employees: { id: string; name: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<TaskFormData>(EMPTY_TASK_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await staffApi.tasks.create({
        title: form.title,
        category: form.category,
        assignedTo: form.assignTo || undefined,
        dueDate: form.dueDate,
        dueTime: form.dueTime,
        requiresPhoto: form.requiresPhoto,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to create task');
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
          className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg p-6 shadow-2xl z-10"
          initial={{ opacity: 0, scale: 0.97, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 16 }}
          transition={{ duration: 0.18 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Add Task</h2>
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
              <input
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                placeholder="e.g. Clean fryer oil"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                >
                  <option value="opening">Opening</option>
                  <option value="closing">Closing</option>
                  <option value="prep">Prep</option>
                  <option value="safety">Safety</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Assign To</label>
                <select
                  value={form.assignTo}
                  onChange={e => setForm(f => ({ ...f, assignTo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                >
                  <option value="">Unassigned</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Due Date *</label>
                <input
                  type="date"
                  required
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Due Time *</label>
                <input
                  type="time"
                  required
                  value={form.dueTime}
                  onChange={e => setForm(f => ({ ...f, dueTime: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="requiresPhoto"
                type="checkbox"
                checked={form.requiresPhoto}
                onChange={e => setForm(f => ({ ...f, requiresPhoto: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 accent-blue-600"
              />
              <label htmlFor="requiresPhoto" className="text-sm text-gray-700">Requires photo on completion</label>
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
                {saving ? 'Creating…' : 'Create Task'}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Animated Checkbox ───────────────────────────────────────────────────────

function TaskCheckbox({ status, onClick }: { status: TaskStatus; onClick: () => void }) {
  const completed = status === 'completed';
  return (
    <motion.button
      onClick={onClick}
      disabled={completed}
      className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
        completed
          ? 'border-green-500 bg-green-500 text-white'
          : 'border-gray-300 hover:border-blue-500'
      }`}
      whileHover={completed ? {} : { scale: 1.12 }}
      whileTap={completed ? {} : { scale: 0.9 }}
      title={completed ? 'Completed' : 'Mark complete'}
    >
      {completed && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
          <motion.path
            d="M2 6l3 3 5-5"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </svg>
      )}
    </motion.button>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [completeTask, setCompleteTask] = useState<any | null>(null);

  const { data: tasksData, isLoading: tasksLoading, mutate } = useSWR(
    `tasks-${selectedDate}-${activeCategory}`,
    () => staffApi.tasks.list({ date: selectedDate, category: activeCategory === 'all' ? undefined : activeCategory })
  );

  const { data: empData } = useSWR(
    'employees-list',
    () => staffApi.employees.list()
  );

  const tasks: any[] = Array.isArray(tasksData?.data) ? tasksData.data : (Array.isArray(tasksData) ? tasksData : []);
  const allEmployees: { id: string; name: string }[] = (
    Array.isArray(empData?.data) ? empData.data : (Array.isArray(empData) ? empData : [])
  ).map((e: any) => ({ id: e.id, name: e.fullName ?? e.name ?? 'Unknown' }));

  const grouped = groupByCategory(tasks);

  const categoryKeys = activeCategory === 'all'
    ? Object.keys(grouped)
    : grouped[activeCategory] ? [activeCategory] : [];

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
          />
          <motion.button
            onClick={() => setShowAddSheet(true)}
            className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-lg shadow-sm"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            + Add Task
          </motion.button>
        </div>
      </div>

      {/* Category tabs with sliding underline indicator */}
      <div className="relative flex gap-1 border-b border-gray-200">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              activeCategory === cat.key ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {cat.label}
            {activeCategory === cat.key && (
              <motion.span
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full"
                layoutId="activeTab"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      {tasksLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-gray-400 bg-white rounded-xl border border-gray-200">
          <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p className="font-medium text-sm">No tasks scheduled</p>
          <p className="text-xs">Add tasks using the button above</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            className="space-y-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {categoryKeys.map(cat => (
              <div key={cat} className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wide ${CATEGORY_COLOR[cat] ?? 'text-gray-600'}`}>
                    {cat}
                  </span>
                  <span className="text-xs text-gray-400">({grouped[cat]?.length ?? 0})</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {(grouped[cat] ?? []).map((task: any, i: number) => {
                    const status = taskStatus(task);
                    const assigneeName =
                      task.assigneeName ?? task.assignee?.fullName ?? task.assignee?.name ?? task.assignedToName ?? '—';
                    const photoUrl = task.photoUrl ?? task.photo_url;
                    return (
                      <motion.div
                        key={task.id}
                        className={`flex items-start gap-4 px-5 py-4 transition-colors hover:bg-gray-50/70 ${
                          status === 'overdue' ? 'border-l-4 border-red-500 bg-red-50/20' : ''
                        }`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.2 }}
                      >
                        {/* Animated checkbox */}
                        <TaskCheckbox
                          status={status}
                          onClick={() => status !== 'completed' && setCompleteTask(task)}
                        />

                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm ${status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {task.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                            <span className="text-xs text-gray-400">{assigneeName}</span>
                            <span className="text-xs text-gray-400">Due {fmt12(task.dueTime ?? task.due_time)}</span>
                            {task.requiresPhoto && (
                              <span className="text-xs text-blue-500 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Photo required
                              </span>
                            )}
                          </div>
                          {task.notes && (
                            <p className="text-xs text-gray-500 mt-1 italic">{task.notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          {photoUrl && (
                            <a href={photoUrl} target="_blank" rel="noopener noreferrer">
                              <img
                                src={photoUrl}
                                alt="Completion photo"
                                className="w-10 h-10 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition-opacity"
                              />
                            </a>
                          )}
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass(status)}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusDot(status)}`} />
                            {status}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Add Task Sheet */}
      {showAddSheet && (
        <AddTaskSheet
          employees={allEmployees}
          onClose={() => setShowAddSheet(false)}
          onSuccess={() => mutate()}
        />
      )}

      {/* Complete Dialog */}
      {completeTask && (
        <CompleteDialog
          task={completeTask}
          onClose={() => setCompleteTask(null)}
          onDone={() => mutate()}
        />
      )}
    </motion.div>
  );
}

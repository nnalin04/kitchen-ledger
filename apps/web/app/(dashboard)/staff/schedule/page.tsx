'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { motion } from 'motion/react';
import { apiClient } from '@/lib/api/client';
import { staffApi } from '@/lib/api/staff.api';

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const fetcher = (url: string) => apiClient.get(url).then(r => r.data.data);

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');

  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekDays = getWeekDays(weekStart);

  const { data: scheduleData, isLoading } = useSWR(
    `/api/staff/schedule?weekStart=${weekStartStr}`,
    fetcher
  );

  function prevWeek() {
    setWeekStart(d => {
      const n = new Date(d);
      n.setDate(n.getDate() - 7);
      return n;
    });
  }

  function nextWeek() {
    setWeekStart(d => {
      const n = new Date(d);
      n.setDate(n.getDate() + 7);
      return n;
    });
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishMsg('');
    try {
      await staffApi.schedule.publish({ weekStart: weekStartStr });
      setPublishMsg('Schedule published successfully!');
    } catch {
      setPublishMsg('Failed to publish schedule.');
    } finally {
      setPublishing(false);
      setTimeout(() => setPublishMsg(''), 3000);
    }
  }

  const employees: any[] = scheduleData?.employees ?? [];

  const shiftStatusClass = (status: string) => {
    if (status === 'completed') return 'bg-green-100 text-green-800';
    if (status === 'cancelled') return 'bg-red-100 text-red-500 line-through';
    return 'bg-blue-100 text-blue-800';
  };

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={prevWeek}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[160px] text-center">
            {weekStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
            {' — '}
            {weekDays[6].toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button
            onClick={nextWeek}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Next →
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {publishing ? 'Publishing…' : 'Publish Schedule'}
          </button>
        </div>
      </div>

      {publishMsg && (
        <p
          className={`text-sm px-4 py-2 rounded-lg ${
            publishMsg.includes('success')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {publishMsg}
        </p>
      )}

      {/* Schedule Grid */}
      <motion.div
        className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
      >
        <div className="min-w-[700px]">
          {/* Header row */}
          <div className="grid grid-cols-8 border-b bg-gray-50 text-xs font-medium text-gray-500">
            <div className="px-3 py-2 border-r border-gray-200">Employee</div>
            {weekDays.map((day, i) => {
              const isToday = day.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
              return (
                <div
                  key={i}
                  className={`px-2 py-2 text-center border-r border-gray-200 last:border-r-0 ${
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
                <div key={i} className="grid grid-cols-8 border-b border-gray-100 animate-pulse">
                  <div className="px-3 py-3 border-r border-gray-100">
                    <div className="h-4 bg-gray-100 rounded w-24" />
                  </div>
                  {weekDays.map((_, j) => (
                    <div key={j} className="p-2 border-r border-gray-100 last:border-r-0">
                      <div className="h-8 bg-gray-50 rounded" />
                    </div>
                  ))}
                </div>
              ))
            : employees.length === 0
            ? (
              <div className="text-center py-12 text-gray-400 col-span-8">
                <p className="text-base font-medium">No employees scheduled this week</p>
                <p className="text-sm mt-1">Add shifts to build the schedule</p>
              </div>
            )
            : employees.map((emp: any) => (
                <div key={emp.id} className="grid grid-cols-8 border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className="px-3 py-3 text-sm font-medium text-gray-800 border-r border-gray-100 flex items-center">
                    {emp.fullName}
                  </div>
                  {weekDays.map((day, di) => {
                    const dayStr = day.toISOString().split('T')[0];
                    const shift = emp.shifts?.find((s: any) => s.shiftDate === dayStr);
                    return (
                      <div
                        key={di}
                        className="p-1.5 border-r border-gray-100 last:border-r-0"
                      >
                        {shift ? (
                          <div
                            className={`rounded text-xs p-1.5 text-center font-medium ${shiftStatusClass(shift.status ?? 'scheduled')}`}
                          >
                            <div>{shift.startTime?.slice(0, 5)}–{shift.endTime?.slice(0, 5)}</div>
                            {shift.role && (
                              <div className="text-xs opacity-70 capitalize mt-0.5">
                                {shift.role.replace('_', ' ')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-full min-h-8 flex items-center justify-center text-gray-200 hover:bg-blue-50 hover:text-blue-400 rounded cursor-pointer text-xl transition-colors select-none">
                            +
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
        </div>
      </motion.div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-100 inline-block" />
          Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-100 inline-block" />
          Completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-100 inline-block" />
          Cancelled
        </span>
      </div>
    </motion.div>
  );
}

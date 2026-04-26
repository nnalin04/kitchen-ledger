'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { apiClient } from '@/lib/api/client';

const fetcher = (url: string) => apiClient.get(url).then(r => r.data.data);

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function StaffPage() {
  const today = new Date().toISOString().split('T')[0];

  const { data: employees } = useSWR('/api/staff/employees', fetcher);
  const { data: tasks } = useSWR(`/api/staff/tasks/checklist/${today}`, fetcher);
  const { data: tips } = useSWR('/api/staff/tips', fetcher);

  const totalEmployees = Array.isArray(employees) ? employees.filter((e: any) => e.status === 'active' || !e.status).length : '—';
  const pendingTasks = Array.isArray(tasks) ? tasks.filter((t: any) => !t.completedAt).length : '—';
  const openTipPools = Array.isArray(tips) ? tips.filter((t: any) => t.status === 'open').length : '—';

  const navCards = [
    {
      href: '/staff/employees',
      title: 'Employees',
      desc: 'Manage employee profiles, roles, and pay rates',
      icon: '👥',
      color: 'bg-purple-50 border-purple-200',
      textColor: 'text-purple-700',
    },
    {
      href: '/staff/schedule',
      title: 'Schedule',
      desc: 'Build and publish weekly shift schedules',
      icon: '📅',
      color: 'bg-blue-50 border-blue-200',
      textColor: 'text-blue-700',
    },
    {
      href: '/staff/attendance',
      title: 'Attendance',
      desc: 'Track clock-ins, hours worked, and overtime',
      icon: '🕐',
      color: 'bg-green-50 border-green-200',
      textColor: 'text-green-700',
    },
    {
      href: '/staff/tasks',
      title: 'Tasks',
      desc: 'Daily checklists — opening, closing, prep, safety',
      icon: '✅',
      color: 'bg-yellow-50 border-yellow-200',
      textColor: 'text-yellow-700',
    },
    {
      href: '/staff/tips',
      title: 'Tip Pools',
      desc: 'Calculate and distribute tip earnings fairly',
      icon: '💰',
      color: 'bg-orange-50 border-orange-200',
      textColor: 'text-orange-700',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
        <p className="text-sm text-gray-500 mt-1">Scheduling, attendance, tasks, and tip management</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Active Employees" value={totalEmployees} color="text-gray-900" />
        <StatCard
          label="Shifts Today"
          value="—"
          sub="Live from schedule"
          color="text-blue-600"
        />
        <StatCard
          label="Pending Tasks"
          value={pendingTasks}
          sub={`As of today, ${today}`}
          color={typeof pendingTasks === 'number' && pendingTasks > 0 ? 'text-yellow-600' : 'text-gray-900'}
        />
        <StatCard
          label="Open Tip Pools"
          value={openTipPools}
          sub="Awaiting distribution"
          color={typeof openTipPools === 'number' && openTipPools > 0 ? 'text-orange-600' : 'text-gray-900'}
        />
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {navCards.map(card => (
          <Link
            key={card.href}
            href={card.href}
            className={`rounded-xl border p-5 flex items-start gap-4 hover:shadow-md transition-shadow ${card.color}`}
          >
            <span className="text-2xl">{card.icon}</span>
            <div>
              <p className={`font-semibold text-base ${card.textColor}`}>{card.title}</p>
              <p className="text-sm text-gray-500 mt-0.5">{card.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

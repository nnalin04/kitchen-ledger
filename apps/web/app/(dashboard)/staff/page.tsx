'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { apiClient } from '@/lib/api/client';

const fetcher = (url: string) => apiClient.get(url).then((r: { data: { data: unknown } }) => r.data.data);

// ── Status glow tokens ────────────────────────────────────────────────────────

type Status = 'good' | 'warning' | 'danger' | 'neutral';

const STATUS_GLOW: Record<Status, string> = {
  good: '0 0 0 1px rgba(34,197,94,0.3), 0 0 16px rgba(34,197,94,0.08)',
  warning: '0 0 0 1px rgba(245,158,11,0.35), 0 0 16px rgba(245,158,11,0.1)',
  danger: '0 0 0 1px rgba(239,68,68,0.4), 0 0 20px rgba(239,68,68,0.12)',
  neutral: '0 0 0 1px rgba(30,41,59,0.8)',
};

const STATUS_DOT: Record<Status, string> = {
  good: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  neutral: 'bg-slate-600',
};

const STATUS_VALUE_COLOR: Record<Status, string> = {
  good: 'text-emerald-300',
  warning: 'text-amber-300',
  danger: 'text-red-300',
  neutral: 'text-slate-100',
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  status = 'neutral',
  index = 0,
}: {
  label: string;
  value: string | number;
  sub?: string;
  status?: Status;
  index?: number;
}) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduce ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.35, ease: 'easeOut' }}
      whileHover={shouldReduce ? {} : { y: -2, transition: { duration: 0.15 } }}
      className="relative overflow-hidden rounded-xl p-5 cursor-default"
      style={{ background: 'rgba(14,18,35,0.95)', boxShadow: STATUS_GLOW[status] }}
    >
      {/* Ledger-line texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, #94a3b8 0px, #94a3b8 1px, transparent 1px, transparent 24px)',
        }}
      />

      <div className="flex items-center gap-1.5 mb-1.5">
        {status !== 'neutral' && (
          <motion.span
            className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`}
            animate={
              shouldReduce || status === 'good'
                ? {}
                : { opacity: [1, 0.3, 1], scale: [1, 1.5, 1] }
            }
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
          {label}
        </p>
      </div>

      <p className={`font-mono text-2xl font-bold tabular-nums leading-none ${STATUS_VALUE_COLOR[status]}`}>
        {value}
      </p>

      {sub && (
        <p className="text-[11px] text-slate-600 mt-1.5 font-mono">{sub}</p>
      )}
    </motion.div>
  );
}

// ── Nav Card ──────────────────────────────────────────────────────────────────

interface NavCardDef {
  href: string;
  title: string;
  desc: string;
  icon: string;
  accentColor: string;
  accentBg: string;
}

function NavCard({ card, index }: { card: NavCardDef; index: number }) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduce ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 + index * 0.07, duration: 0.3, ease: 'easeOut' }}
      whileHover={
        shouldReduce
          ? {}
          : { y: -3, boxShadow: '0 0 0 1px rgba(99,102,241,0.35), 0 8px 24px rgba(0,0,0,0.25)' }
      }
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(14,18,35,0.95)',
        boxShadow: '0 0 0 1px rgba(30,41,59,0.8)',
        willChange: 'transform',
      }}
    >
      <Link href={card.href} className="block p-5 group">
        <div className="flex items-start gap-4">
          <div
            className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 text-xl ${card.accentBg}`}
          >
            {card.icon}
          </div>
          <div>
            <p className={`font-semibold text-sm ${card.accentColor} group-hover:brightness-110 transition-all`}>
              {card.title}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{card.desc}</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const shouldReduce = useReducedMotion();
  const today = new Date().toISOString().split('T')[0];

  const { data: employees } = useSWR('/api/staff/employees', fetcher);
  const { data: tasks } = useSWR(`/api/staff/tasks/checklist/${today}`, fetcher);
  const { data: tips } = useSWR('/api/staff/tips', fetcher);

  const totalEmployees = Array.isArray(employees)
    ? employees.filter((e: Record<string, unknown>) => e.status === 'active' || !e.status).length
    : '—';
  const pendingTasks = Array.isArray(tasks)
    ? tasks.filter((t: Record<string, unknown>) => !t.completedAt).length
    : '—';
  const openTipPools = Array.isArray(tips)
    ? tips.filter((t: Record<string, unknown>) => t.status === 'open').length
    : '—';

  const navCards: NavCardDef[] = [
    {
      href: '/staff/employees',
      title: 'Employees',
      desc: 'Manage employee profiles, roles, and pay rates',
      icon: '👥',
      accentColor: 'text-violet-300',
      accentBg: 'bg-violet-500/15',
    },
    {
      href: '/staff/schedule',
      title: 'Schedule',
      desc: 'Build and publish weekly shift schedules',
      icon: '📅',
      accentColor: 'text-blue-300',
      accentBg: 'bg-blue-500/15',
    },
    {
      href: '/staff/attendance',
      title: 'Attendance',
      desc: 'Track clock-ins, hours worked, and overtime',
      icon: '🕐',
      accentColor: 'text-emerald-300',
      accentBg: 'bg-emerald-500/15',
    },
    {
      href: '/staff/tasks',
      title: 'Tasks',
      desc: 'Daily checklists — opening, closing, prep, safety',
      icon: '✅',
      accentColor: 'text-amber-300',
      accentBg: 'bg-amber-500/15',
    },
    {
      href: '/staff/tips',
      title: 'Tip Pools',
      desc: 'Calculate and distribute tip earnings fairly',
      icon: '💰',
      accentColor: 'text-orange-300',
      accentBg: 'bg-orange-500/15',
    },
  ];

  return (
    <div
      className="min-h-screen space-y-8 p-6"
      style={{ background: 'linear-gradient(160deg, #020617 0%, #0a0f1e 50%, #020617 100%)' }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: shouldReduce ? 0 : -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <h1 className="font-serif text-2xl text-slate-100">Staff</h1>
        <p className="text-sm text-slate-400 mt-1">
          Scheduling, attendance, tasks, and tip management
        </p>
      </motion.div>

      {/* Row label */}
      <motion.p
        className="text-[9px] font-bold tracking-[0.25em] text-slate-600 uppercase -mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        ◈ Quick Stats — Today
      </motion.p>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Active Employees"
          value={totalEmployees}
          status="neutral"
          index={0}
        />
        <StatCard
          label="Shifts Today"
          value="—"
          sub="Live from schedule"
          status="neutral"
          index={1}
        />
        <StatCard
          label="Pending Tasks"
          value={pendingTasks}
          sub={`As of today, ${today}`}
          status={
            typeof pendingTasks === 'number' && pendingTasks > 0 ? 'warning' : 'neutral'
          }
          index={2}
        />
        <StatCard
          label="Open Tip Pools"
          value={openTipPools}
          sub="Awaiting distribution"
          status={
            typeof openTipPools === 'number' && openTipPools > 0 ? 'warning' : 'neutral'
          }
          index={3}
        />
      </div>

      {/* Navigation section label */}
      <motion.p
        className="text-[9px] font-bold tracking-[0.25em] text-slate-600 uppercase -mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        ◈ Sections
      </motion.p>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {navCards.map((card, i) => (
          <NavCard key={card.href} card={card} index={i} />
        ))}
      </div>

      {/* Footer strip */}
      <motion.div
        className="flex items-center justify-between border-t border-slate-800/60 pt-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
      >
        <p className="text-[10px] font-mono text-slate-700 tracking-wider">
          KITCHENLEDGER · STAFF
        </p>
        <Link
          href="/staff/schedule"
          className="text-[10px] font-semibold tracking-[0.15em] text-blue-500 hover:text-blue-400 uppercase transition-colors"
        >
          View Schedule →
        </Link>
      </motion.div>
    </div>
  );
}

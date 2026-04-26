'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import useSWR, { mutate } from 'swr';
import { apiClient } from '@/lib/api/client';
import { RoleGuard } from '@/components/layout/RoleGuard';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

// ── Types ─────────────────────────────────────────────────────────────────────

type UserRole = 'owner' | 'manager' | 'kitchen_staff' | 'server';

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fetcher = (url: string) => apiClient.get(url).then((r: { data: { data?: unknown; [k: string]: unknown } }) => r.data?.data ?? r.data);

const ROLE_CONFIG: Record<UserRole, { dot: string; pill: string; label: string }> = {
  owner: {
    dot: 'bg-purple-500',
    pill: 'bg-purple-100 text-purple-800 border border-purple-200',
    label: 'Owner',
  },
  manager: {
    dot: 'bg-blue-500',
    pill: 'bg-blue-100 text-blue-800 border border-blue-200',
    label: 'Manager',
  },
  kitchen_staff: {
    dot: 'bg-orange-500',
    pill: 'bg-orange-100 text-orange-800 border border-orange-200',
    label: 'Kitchen Staff',
  },
  server: {
    dot: 'bg-green-500',
    pill: 'bg-green-100 text-green-800 border border-green-200',
    label: 'Server',
  },
};

function RoleBadge({ role }: { role: UserRole }) {
  const cfg = ROLE_CONFIG[role] ?? { dot: 'bg-gray-400', pill: 'bg-gray-100 text-gray-700 border border-gray-200', label: role };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatLastLogin(ts: string | null): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`relative inline-flex h-5 w-9 items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        checked ? 'bg-green-500' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ transition: 'background-color 0.2s ease' }}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm"
        style={{
          transform: checked ? 'translateX(20px)' : 'translateX(2px)',
          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </button>
  );
}

// ── Invite Sheet ──────────────────────────────────────────────────────────────

function InviteSheet({ onInvited }: { onInvited: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<string>('server');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiClient.post('/api/auth/users/invite', { email, full_name: fullName, role });
      setOpen(false);
      setEmail('');
      setFullName('');
      setRole('server');
      onInvited();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to send invite.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          Invite User
        </motion.button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Invite Team Member</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inviteEmail">Email Address</Label>
            <Input
              id="inviteEmail"
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inviteFullName">Full Name</Label>
            <Input
              id="inviteFullName"
              value={fullName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFullName(e.target.value)}
              placeholder="First Last"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="kitchen_staff">Kitchen Staff</SelectItem>
                <SelectItem value="server">Server</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AnimatePresence>
            {error && (
              <motion.p
                className="text-sm text-red-600"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
          <div className="pt-2 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? 'Sending...' : 'Send Invite'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function TeamRow({ member, onRefresh, index }: { member: TeamMember; onRefresh: () => void; index: number }) {
  const [roleChanging, setRoleChanging] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleRoleChange(newRole: string) {
    setRoleChanging(true);
    try {
      await apiClient.patch(`/api/auth/users/${member.id}/role`, { role: newRole });
      onRefresh();
    } catch {
      // silently fail — UI reverts on refresh
    } finally {
      setRoleChanging(false);
    }
  }

  async function handleToggleActive() {
    setToggling(true);
    try {
      if (member.is_active) {
        await apiClient.patch(`/api/auth/users/${member.id}/deactivate`);
      } else {
        await apiClient.patch(`/api/auth/users/${member.id}/activate`);
      }
      onRefresh();
    } catch {
      // ignore
    } finally {
      setToggling(false);
    }
  }

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className="border-b border-gray-100 last:border-0 hover:bg-blue-50/30 transition-colors group"
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ring-2 ring-white">
            {member.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-800 text-sm">{member.full_name}</p>
            <p className="text-xs text-gray-400">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        {member.role === 'owner' ? (
          <RoleBadge role="owner" />
        ) : (
          <Select
            value={member.role}
            onValueChange={handleRoleChange}
            disabled={roleChanging}
          >
            <SelectTrigger className="h-7 text-xs w-36 border-0 bg-transparent p-0 focus:ring-0">
              <SelectValue>
                <RoleBadge role={member.role} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="kitchen_staff">Kitchen Staff</SelectItem>
              <SelectItem value="server">Server</SelectItem>
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="px-4 py-3.5 text-sm text-gray-400">
        {formatLastLogin(member.last_login_at)}
      </td>
      <td className="px-4 py-3.5">
        {member.role !== 'owner' && (
          <Toggle
            checked={member.is_active}
            onChange={handleToggleActive}
            disabled={toggling}
            ariaLabel={member.is_active ? 'Deactivate user' : 'Activate user'}
          />
        )}
      </td>
    </motion.tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function TeamPageContent() {
  const { data: members, isLoading } = useSWR<TeamMember[]>('/api/auth/users', fetcher);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function refresh() {
    mutate('/api/auth/users');
  }

  function handleInvited() {
    refresh();
    showToast('Invite sent successfully.');
  }

  const active = (members ?? []).filter(m => m.is_active);
  const inactive = (members ?? []).filter(m => !m.is_active);

  return (
    <div className="max-w-4xl space-y-6">
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed top-5 right-5 z-50 bg-green-600 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2"
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage who has access to your KitchenLedger account.
          </p>
        </div>
        <InviteSheet onInvited={handleInvited} />
      </motion.div>

      {/* Active members */}
      <motion.div
        className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.07, ease: 'easeOut' }}
      >
        <div className="px-4 py-3.5 border-b bg-gray-50/50 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Active
            </span>
            <span className="text-gray-400 font-normal text-xs">{active.length} members</span>
          </p>
        </div>
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Member</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Role</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Last Login</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Active</th>
              </tr>
            </thead>
            <tbody>
              {active.map((m, i) => (
                <TeamRow key={m.id} member={m} onRefresh={refresh} index={i} />
              ))}
              {active.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      <p className="text-sm text-gray-400">No active team members.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </motion.div>

      {/* Inactive members */}
      {inactive.length > 0 && (
        <motion.div
          className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.12, ease: 'easeOut' }}
        >
          <div className="px-4 py-3.5 border-b bg-gray-50/50">
            <p className="text-sm font-semibold text-gray-500 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                Deactivated
              </span>
              <span className="text-gray-400 font-normal text-xs">{inactive.length} members</span>
            </p>
          </div>
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Member</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Role</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Last Login</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Active</th>
              </tr>
            </thead>
            <tbody>
              {inactive.map((m, i) => (
                <TeamRow key={m.id} member={m} onRefresh={refresh} index={i} />
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}

export default function TeamPage() {
  return (
    <RoleGuard
      allowedRoles={['owner']}
      fallback={
        <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Access Restricted</h2>
            <p className="text-sm text-gray-500 mt-1">
              Only account owners can manage team members.
            </p>
          </div>
        </div>
      }
    >
      <TeamPageContent />
    </RoleGuard>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useAuthStore } from '@/stores/auth.store';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-7 w-7 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center text-slate-400 flex-shrink-0">
        {icon}
      </div>
      <h2 className="font-serif text-base text-slate-100">{children}</h2>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  required,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-colors"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        <EyeIcon open={show} />
      </button>
    </div>
  );
}

// ── Dark-themed label ─────────────────────────────────────────────────────────

function DarkLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5"
    >
      {children}
    </label>
  );
}

// ── Dark-themed text input ────────────────────────────────────────────────────

function DarkInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  readOnly,
  disabled,
}: {
  id?: string;
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      readOnly={readOnly}
      disabled={disabled}
      className={`w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-colors ${
        disabled || readOnly ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    />
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
      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed ${
        showCheck
          ? 'bg-emerald-600'
          : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50'
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
            {saving ? 'Saving...' : 'Save Changes'}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  children,
  index = 0,
  dangerZone = false,
}: {
  children: React.ReactNode;
  index?: number;
  dangerZone?: boolean;
}) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      className="rounded-xl border p-6 space-y-5"
      style={
        dangerZone
          ? {
              background: 'rgba(69,10,10,0.18)',
              borderColor: 'rgba(153,27,27,0.4)',
              boxShadow: '0 0 0 1px rgba(239,68,68,0.12)',
            }
          : {
              background: 'rgba(14,18,35,0.95)',
              boxShadow: '0 0 0 1px rgba(30,41,59,0.8)',
              borderColor: 'transparent',
            }
      }
      initial={{ opacity: 0, y: shouldReduce ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.07, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfileSettingsPage() {
  const shouldReduce = useReducedMotion();
  const { user } = useAuthStore();

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [language, setLanguage] = useState(user?.language ?? 'en');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileSavedKey, setProfileSavedKey] = useState(0);
  const [passwordSavedKey, setPasswordSavedKey] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [avatarHover, setAvatarHover] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? '');
      setPhone((user as Record<string, unknown>).phone as string ?? '');
      setLanguage((user as Record<string, unknown>).language as string ?? 'en');
    }
  }, [user]);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await apiClient.patch('/api/auth/users/profile', { full_name: fullName, phone, language });
      setProfileSavedKey(k => k + 1);
    } catch {
      showToast('Failed to update profile.', 'error');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    setPasswordSaving(true);
    try {
      await apiClient.post('/api/auth/users/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSavedKey(k => k + 1);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to change password.';
      showToast(msg, 'error');
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen p-6"
      style={{ background: 'linear-gradient(160deg, #020617 0%, #0a0f1e 50%, #020617 100%)' }}
    >
      <div className="max-w-2xl space-y-8">
        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
                toast.type === 'success'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-red-600 text-white'
              }`}
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              {toast.type === 'success' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              )}
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduce ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <h1 className="font-serif text-2xl text-slate-100">Profile Settings</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your personal information and security.
          </p>
        </motion.div>

        {/* ── Personal Information ── */}
        <SectionCard index={1}>
          <SectionHeading icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          }>
            Personal Information
          </SectionHeading>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div
              className="relative h-16 w-16 rounded-full flex-shrink-0 cursor-pointer"
              onMouseEnter={() => setAvatarHover(true)}
              onMouseLeave={() => setAvatarHover(false)}
            >
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-xl font-bold text-white">
                {initials(user?.full_name)}
              </div>
              <AnimatePresence>
                {avatarHover && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-black/60 flex flex-col items-center justify-center gap-0.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    <span className="text-white text-[9px] font-medium leading-tight">Change</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div>
              <p className="font-semibold text-slate-200">{user?.full_name ?? '—'}</p>
              <p className="text-sm text-slate-500">{user?.email ?? '—'}</p>
              <button className="mt-1 text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors">
                Upload Photo
              </button>
            </div>
          </div>

          <div className="border-t border-slate-800/80" />

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <DarkLabel htmlFor="fullName">Full Name</DarkLabel>
                <DarkInput
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
              <div>
                <DarkLabel htmlFor="email">Email</DarkLabel>
                <DarkInput
                  id="email"
                  value={user?.email ?? ''}
                  readOnly
                  disabled
                  placeholder="—"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <DarkLabel htmlFor="phone">Phone</DarkLabel>
                <DarkInput
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  type="tel"
                />
              </div>
              <div>
                <DarkLabel>Language</DarkLabel>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100 focus:ring-blue-500/40 focus:border-blue-500/60">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                    <SelectItem value="en" className="focus:bg-slate-800 focus:text-slate-100">English</SelectItem>
                    <SelectItem value="hi" className="focus:bg-slate-800 focus:text-slate-100">Hindi</SelectItem>
                    <SelectItem value="ta" className="focus:bg-slate-800 focus:text-slate-100">Tamil</SelectItem>
                    <SelectItem value="te" className="focus:bg-slate-800 focus:text-slate-100">Telugu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <SaveButton saving={profileSaving} savedKey={profileSavedKey} />
            </div>
          </form>
        </SectionCard>

        {/* ── Change Password ── */}
        <SectionCard index={2}>
          <SectionHeading icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          }>
            Change Password
          </SectionHeading>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <DarkLabel htmlFor="currentPassword">Current Password</DarkLabel>
              <PasswordInput
                id="currentPassword"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <DarkLabel htmlFor="newPassword">New Password</DarkLabel>
                <PasswordInput
                  id="newPassword"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <DarkLabel htmlFor="confirmPassword">Confirm New Password</DarkLabel>
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <SaveButton saving={passwordSaving} savedKey={passwordSavedKey} />
            </div>
          </form>
        </SectionCard>

        {/* ── Danger Zone ── */}
        <SectionCard index={3} dangerZone>
          <SectionHeading icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          }>
            Danger Zone
          </SectionHeading>
          <p className="text-sm text-slate-400 -mt-2">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <div className="pt-1">
            <motion.button
              type="button"
              whileHover={{
                scale: 1.02,
                boxShadow: '0 0 0 1px rgba(239,68,68,0.6), 0 0 20px rgba(239,68,68,0.18)',
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-red-400 border border-red-900/60 bg-red-950/30 hover:bg-red-950/50 hover:text-red-300 transition-colors"
            >
              Delete My Account
            </motion.button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import useSWR, { mutate as globalMutate } from 'swr';
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
import { RoleGuard } from '@/components/layout/RoleGuard';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'revenue' | 'cogs' | 'expense';
  parent_id: string | null;
  is_system: boolean;
  balance?: number;
}

interface NewAccountRow {
  parentId: string | null;
  code: string;
  name: string;
  account_type: Account['account_type'];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTIONS: { label: string; type: Account['account_type']; borderColor: string; headerBg: string; icon: React.ReactNode }[] = [
  {
    label: 'Revenue',
    type: 'revenue',
    borderColor: 'border-green-200',
    headerBg: 'bg-green-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
    ),
  },
  {
    label: 'Cost of Goods Sold (COGS)',
    type: 'cogs',
    borderColor: 'border-orange-200',
    headerBg: 'bg-orange-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
    ),
  },
  {
    label: 'Operating Expenses',
    type: 'expense',
    borderColor: 'border-red-200',
    headerBg: 'bg-red-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    ),
  },
  {
    label: 'Assets',
    type: 'asset',
    borderColor: 'border-blue-200',
    headerBg: 'bg-blue-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
    ),
  },
  {
    label: 'Liabilities',
    type: 'liability',
    borderColor: 'border-purple-200',
    headerBg: 'bg-purple-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
    ),
  },
];

const TYPE_LABELS: Record<Account['account_type'], string> = {
  asset: 'Asset',
  liability: 'Liability',
  revenue: 'Revenue',
  cogs: 'COGS',
  expense: 'Expense',
};

const TYPE_BADGE: Record<Account['account_type'], string> = {
  asset: 'bg-blue-100 text-blue-800 border border-blue-200',
  liability: 'bg-purple-100 text-purple-800 border border-purple-200',
  revenue: 'bg-green-100 text-green-800 border border-green-200',
  cogs: 'bg-orange-100 text-orange-800 border border-orange-200',
  expense: 'bg-red-100 text-red-800 border border-red-200',
};

const ACCOUNTS_KEY = '/api/finance/accounts';
const fetcher = (url: string) => apiClient.get(url).then((r: { data: { data?: unknown; [k: string]: unknown } }) => r.data.data ?? r.data);

// ── Lock Icon ─────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-gray-300 flex-shrink-0"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// ── Add Account Row Component ─────────────────────────────────────────────────

function AddAccountRow({
  parentId,
  defaultType,
  onSave,
  onCancel,
}: {
  parentId: string | null;
  defaultType: Account['account_type'];
  onSave: (row: NewAccountRow) => Promise<void>;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<Account['account_type']>(defaultType);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!code.trim() || !name.trim()) return;
    setSaving(true);
    try {
      await onSave({ parentId, code: code.trim(), name: name.trim(), account_type: type });
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      className="flex items-center gap-2 px-3 py-2.5 bg-blue-50/50 border border-dashed border-blue-300 rounded-lg"
      initial={{ opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -4, height: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Input
        placeholder="Code (e.g. 4100)"
        value={code}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
        className="w-28 h-8 text-sm"
        autoFocus
      />
      <Input
        placeholder="Account name"
        value={name}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
        className="flex-1 h-8 text-sm"
      />
      <Select value={type} onValueChange={(v: string) => setType(v as Account['account_type'])}>
        <SelectTrigger className="w-32 h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={handleSave} disabled={saving || !code || !name} className="bg-blue-600 hover:bg-blue-700 text-white">
        {saving ? 'Saving…' : 'Save'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
    </motion.div>
  );
}

// ── Section Component ─────────────────────────────────────────────────────────

function AccountSection({
  section,
  accounts,
  onAdd,
  index,
}: {
  section: typeof SECTIONS[0];
  accounts: Account[];
  onAdd: (row: NewAccountRow) => Promise<void>;
  index: number;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const sectionAccounts = accounts.filter(a => a.account_type === section.type);

  return (
    <motion.div
      className={`border ${section.borderColor} rounded-xl overflow-hidden bg-white shadow-sm`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.25, ease: 'easeOut' }}
    >
      {/* Section header */}
      <div className={`flex items-center justify-between px-4 py-3.5 border-b ${section.borderColor} ${section.headerBg}`}>
        <div className="flex items-center gap-2.5">
          <div className="flex-shrink-0">{section.icon}</div>
          <span className="font-semibold text-gray-800 text-sm">{section.label}</span>
          <span className="text-xs text-gray-400 font-normal">({sectionAccounts.length})</span>
        </div>
        <motion.button
          type="button"
          onClick={() => setShowAdd(v => !v)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700 transition-colors shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Account
        </motion.button>
      </div>

      {/* Account rows */}
      <div className="divide-y divide-gray-100">
        {sectionAccounts.length === 0 && !showAdd && (
          <div className="px-4 py-6 flex items-center gap-2 text-sm text-gray-400 italic">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            No accounts yet. Click &ldquo;Add Account&rdquo; to create one.
          </div>
        )}
        {sectionAccounts.map((account, i) => (
          <motion.div
            key={account.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.18 }}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/70 transition-colors group"
          >
            {account.parent_id && <span className="w-4 flex-shrink-0" />}
            <span className="w-20 text-sm font-mono text-gray-400 flex-shrink-0">{account.code}</span>
            <span className="flex-1 text-sm text-gray-800 font-medium">{account.name}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${TYPE_BADGE[account.account_type]}`}>
              {TYPE_LABELS[account.account_type]}
            </span>
            {account.is_system ? (
              <span title="System account — cannot be deleted" className="flex-shrink-0">
                <LockIcon />
              </span>
            ) : (
              <span className="w-[14px] flex-shrink-0" />
            )}
          </motion.div>
        ))}

        {/* Add row */}
        <AnimatePresence>
          {showAdd && (
            <motion.div
              className="px-4 py-3"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <AddAccountRow
                parentId={null}
                defaultType={section.type}
                onSave={async row => {
                  await onAdd(row);
                  setShowAdd(false);
                }}
                onCancel={() => setShowAdd(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const { data: accounts = [], error, isLoading } = useSWR<Account[]>(ACCOUNTS_KEY, fetcher);
  const [saveError, setSaveError] = useState('');

  async function handleAdd(row: NewAccountRow) {
    setSaveError('');
    try {
      await apiClient.post(ACCOUNTS_KEY, {
        code: row.code,
        name: row.name,
        account_type: row.account_type,
        parent_id: row.parentId,
      });
      globalMutate(ACCOUNTS_KEY);
    } catch {
      setSaveError('Failed to create account. Please try again.');
    }
  }

  return (
    <RoleGuard allowedRoles={['owner']}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <h1 className="text-2xl font-bold text-gray-900">Chart of Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your account structure for financial reporting.{' '}
            <span className="inline-flex items-center gap-1 text-gray-400">
              <LockIcon /> System accounts cannot be deleted.
            </span>
          </p>
        </motion.div>

        <AnimatePresence>
          {saveError && (
            <motion.div
              className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {saveError}
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="p-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Failed to load accounts. Please refresh the page.
          </div>
        )}

        {!isLoading && !error && (
          <div className="space-y-4">
            {SECTIONS.map((section, i) => (
              <AccountSection
                key={section.type}
                section={section}
                accounts={accounts}
                onAdd={handleAdd}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

'use client';

// NOTE: @supabase/supabase-js must be installed separately:
//   npm install @supabase/supabase-js
// Required env vars (optional — hook is a no-op when absent):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY

import { useEffect } from 'react';
import { useSWRConfig } from 'swr';

// Lazy-require the supabase client so the app does not crash if the package
// is not yet installed or the env vars are missing.
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
    return createClient(url, key);
  } catch {
    // Package not installed — graceful no-op
    return null;
  }
}

/**
 * Subscribes to Supabase Realtime changes on the `daily_sales_reports` table
 * for the given tenant and auto-revalidates the finance dashboard SWR cache
 * when any row is updated.
 *
 * If Supabase env vars are absent or the package is not installed, this hook
 * is a safe no-op — no errors are thrown.
 */
export function useRealtimeDsr(tenantId: string | undefined) {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    if (!tenantId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`dsr:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'daily_sales_reports',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          // Revalidate dashboard and any daily-report list/trend keys
          mutate('/api/finance/dashboard');
          mutate((key: unknown) => typeof key === 'string' && key.includes('daily-reports'));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, mutate]);
}

/**
 * Subscribes to INSERT events on the `notifications` table for the given
 * user and calls `onNew` whenever a new notification arrives.
 *
 * Safe no-op when Supabase is not configured.
 */
export function useRealtimeNotifications(
  userId: string | undefined,
  onNew: () => void
) {
  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`notif:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => onNew()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onNew]);
}

'use client';

import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { notificationsApi, AppNotification } from '@/lib/api/notifications.api';
import { useRealtimeNotifications } from '@/hooks/use-realtime';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function badgeLabel(count: number): string {
  return count >= 10 ? '9+' : String(count);
}

// ---------------------------------------------------------------------------
// Bell SVG icon (no external dependency)
// ---------------------------------------------------------------------------

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// NotificationBell
// ---------------------------------------------------------------------------

function NotificationBell() {
  const { user } = useAuthStore();

  const [unreadCount, setUnreadCount] = useState(0);
  const [prevCount, setPrevCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await notificationsApi.getUnreadCount();
      setUnreadCount(res.count);
    } catch {
      // Silently ignore — notification count is non-critical
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Track previous count to trigger badge pop-in animation
  useEffect(() => {
    setPrevCount((prev) => {
      // We only care about the transition; capture it then let it settle
      return prev;
    });
  }, [unreadCount]);

  // Realtime subscription — re-fetch count when a new notification arrives
  useRealtimeNotifications(user?.id, fetchUnreadCount);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Fetch recent notifications when popover opens
  useEffect(() => {
    if (!open) return;
    setLoadingNotifs(true);
    notificationsApi
      .list({ limit: 5 })
      .then((res) => setNotifications(res.data))
      .catch(() => setNotifications([]))
      .finally(() => setLoadingNotifs(false));
  }, [open]);

  const handleBellClick = () => {
    setPrevCount(unreadCount);
    setOpen((v) => !v);
  };

  const handleMarkAllRead = async () => {
    if (markingRead) return;
    setMarkingRead(true);
    try {
      await notificationsApi.markAllRead();
      setUnreadCount(0);
      // Refresh the notification list to reflect read state
      const res = await notificationsApi.list({ limit: 5 });
      setNotifications(res.data);
    } catch {
      // Non-critical — silently ignore
    } finally {
      setMarkingRead(false);
    }
  };

  // Whether the badge should animate in (count just went from 0 → >0)
  const badgeShouldAnimate = prevCount === 0 && unreadCount > 0;

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell button */}
      <button
        onClick={handleBellClick}
        aria-label="Notifications"
        className="relative flex items-center justify-center w-9 h-9 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <BellIcon className="w-5 h-5" />

        {/* Unread badge */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={badgeShouldAnimate ? { scale: 0, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25, duration: 0.25 }}
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none pointer-events-none"
            >
              {badgeLabel(unreadCount)}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="popover"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden"
            role="dialog"
            aria-label="Notifications panel"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-800">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-xs text-gray-400">{unreadCount} unread</span>
              )}
            </div>

            {/* Notification list */}
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {loadingNotifs ? (
                <li className="px-4 py-6 text-center text-sm text-gray-400">Loading…</li>
              ) : notifications.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-gray-400">
                  No notifications yet
                </li>
              ) : (
                notifications.map((notif) => (
                  <li
                    key={notif.id}
                    className={`px-4 py-3 flex flex-col gap-0.5 ${
                      !notif.read ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800 leading-snug line-clamp-1">
                        {notif.title}
                      </span>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
                        {formatTimeAgo(notif.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-1 leading-relaxed">
                      {notif.body}
                    </p>
                  </li>
                ))
              )}
            </ul>

            {/* Footer — Mark all read */}
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={handleMarkAllRead}
                disabled={markingRead || unreadCount === 0}
                className="w-full text-center text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors py-0.5"
              >
                {markingRead ? 'Marking as read…' : 'Mark all as read'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

export function Topbar() {
  const { user, tenant, clearAuth } = useAuthStore();
  const { toggleSidebar } = useUIStore();
  const router = useRouter();

  const handleLogout = () => {
    clearAuth();
    router.replace('/login');
  };

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
      <button onClick={toggleSidebar} className="text-gray-500 hover:text-gray-700">
        &#9776;
      </button>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">{tenant?.restaurantName}</span>

        {/* Notification bell */}
        <NotificationBell />

        {/* User avatar + logout */}
        <div className="relative group">
          <button className="w-8 h-8 rounded-full bg-blue-500 text-white text-sm font-bold flex items-center justify-center">
            {user?.fullName?.[0]?.toUpperCase() ?? 'U'}
          </button>
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 hidden group-hover:block z-50">
            <div className="px-4 py-2 text-sm text-gray-700 border-b">{user?.email}</div>
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

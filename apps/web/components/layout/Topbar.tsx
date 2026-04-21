'use client';

import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { useRouter } from 'next/navigation';

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
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">{tenant?.restaurantName}</span>
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

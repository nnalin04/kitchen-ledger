'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUIStore } from '@/stores/ui.store';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/inventory', label: 'Inventory', icon: '📦' },
  { href: '/finance', label: 'Finance', icon: '💰' },
  { href: '/staff', label: 'Staff', icon: '👥' },
  { href: '/ai', label: 'AI Tools', icon: '🤖' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen } = useUIStore();

  return (
    <aside
      className={cn(
        'flex flex-col bg-gray-900 text-white transition-all duration-300',
        sidebarOpen ? 'w-56' : 'w-16'
      )}
    >
      <div className="p-4 font-bold text-lg border-b border-gray-700">
        {sidebarOpen ? '🍴 KitchenLedger' : '🍴'}
      </div>
      <nav className="flex-1 py-4">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-800 transition-colors',
              pathname === item.href && 'bg-gray-800 border-r-2 border-blue-400'
            )}
          >
            <span className="text-lg">{item.icon}</span>
            {sidebarOpen && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

'use client';

import { useAuthStore } from '@/stores/auth.store';
import type { UserRole } from '@kitchenledger/types';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, fallback = null, children }: RoleGuardProps) {
  const { user } = useAuthStore();
  if (!user || !allowedRoles.includes(user.role)) return <>{fallback}</>;
  return <>{children}</>;
}

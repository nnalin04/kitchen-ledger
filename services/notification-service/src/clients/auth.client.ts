import { config } from '../config';

/**
 * Internal HTTP client for Auth Service.
 * Used to resolve users by role for targeted push notifications.
 */
export async function getUsersByRole(
  tenantId: string,
  roles: string[]
): Promise<Array<{ id: string; email: string; role: string }>> {
  // For Phase 2 (email-only events) the caller already has user info in payload.
  // This is a placeholder for Phase 4 when push events need role-based fan-out.
  return [];
}

export async function getUserById(
  userId: string
): Promise<{ id: string; email: string; fullName: string } | null> {
  try {
    const res = await fetch(
      `${config.AUTH_SERVICE_URL}/internal/auth/users/${userId}`,
      {
        headers: {
          'X-Internal-Service-Secret': config.INTERNAL_SERVICE_SECRET,
        },
      }
    );
    if (!res.ok) return null;
    const body = await res.json() as { success: boolean; data: { id: string; email: string; fullName: string } };
    return body.data;
  } catch {
    return null;
  }
}

import { config } from '../config';

const INTERNAL_HEADERS = {
  'X-Internal-Service-Secret': config.INTERNAL_SERVICE_SECRET,
  'Content-Type': 'application/json',
};

/**
 * Resolves active users for a tenant filtered by role(s).
 * Called by dispatcher fan-out to determine push recipients.
 */
export async function getUsersByRole(
  tenantId: string,
  roles: string[]
): Promise<Array<{ id: string; email: string; role: string }>> {
  try {
    const params = new URLSearchParams({ tenantId, roles: roles.join(',') });
    const res = await fetch(
      `${config.AUTH_SERVICE_URL}/internal/auth/users?${params}`,
      { headers: INTERNAL_HEADERS }
    );
    if (!res.ok) {
      console.error('getUsersByRole failed', { status: res.status, tenantId, roles });
      return [];
    }
    const body = await res.json() as { success: boolean; data: Array<{ id: string; email: string; role: string }> };
    return body.data ?? [];
  } catch (err) {
    console.error('getUsersByRole error', err);
    return [];
  }
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

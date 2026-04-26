import { config } from '../config';

const INTERNAL_HEADERS = {
  'x-internal-secret': config.INTERNAL_SERVICE_SECRET,
  'Content-Type': 'application/json',
};

const FETCH_TIMEOUT_MS = 5000;

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

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
    const res = await fetchWithTimeout(
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
    const res = await fetchWithTimeout(
      `${config.AUTH_SERVICE_URL}/internal/auth/users/${userId}`,
      { headers: INTERNAL_HEADERS }
    );
    if (!res.ok) return null;
    const body = await res.json() as { success: boolean; data: { id: string; email: string; fullName: string } };
    return body.data;
  } catch {
    return null;
  }
}

/**
 * Fetches the invite URL for a user from auth-service at email-send time.
 * The raw token is never transmitted over RabbitMQ — it lives only in the
 * auth-service DB and is returned here via a secured internal call.
 * Returns null if no valid (unused, non-expired) invite token exists.
 */
export async function getInviteLink(userId: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `${config.AUTH_SERVICE_URL}/internal/auth/invites/${userId}/link`,
      { headers: INTERNAL_HEADERS }
    );
    if (!res.ok) return null;
    const body = await res.json() as { invite_url: string };
    return body.invite_url ?? null;
  } catch (err) {
    console.error('getInviteLink error', { userId, err });
    return null;
  }
}

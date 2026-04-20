import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockQuery, mockPool, mockSendPush, mockGetUsersByRole } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery };
  const mockSendPush = vi.fn().mockResolvedValue(undefined);
  const mockGetUsersByRole = vi.fn();
  return { mockQuery, mockPool, mockSendPush, mockGetUsersByRole };
});

vi.mock('../../db', () => ({ pool: mockPool }));
vi.mock('../../providers/expo-push.provider', () => ({ sendPush: mockSendPush }));
vi.mock('../../clients/auth.client', () => ({ getUsersByRole: mockGetUsersByRole }));

import { dispatchToTenantRecipients } from '../../providers/dispatcher';

const TENANT_ID = 'tenant-abc';
const EVENT_ID  = 'evt-001';
const BASE_OPTS = {
  eventId: EVENT_ID,
  type: 'inventory.stock.low' as const,
  priority: 'important' as const,
  title: 'Low Stock',
  body: 'Onion is running low',
  data: { item_name: 'Onion' },
};

const OWNER  = { id: 'user-owner',   email: 'owner@rest.com',   role: 'owner' };
const MANAGER = { id: 'user-manager', email: 'mgr@rest.com',    role: 'manager' };

describe('dispatchToTenantRecipients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing dedup rows → not yet processed
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('sends push to each active recipient', async () => {
    mockGetUsersByRole.mockResolvedValue([OWNER, MANAGER]);

    await dispatchToTenantRecipients(TENANT_ID, BASE_OPTS);

    // Called getUsersByRole with owner + manager roles
    expect(mockGetUsersByRole).toHaveBeenCalledWith(TENANT_ID, ['owner', 'manager']);

    // sendPush called once per recipient
    expect(mockSendPush).toHaveBeenCalledTimes(2);
    expect(mockSendPush).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER.id, title: BASE_OPTS.title })
    );
    expect(mockSendPush).toHaveBeenCalledWith(
      expect.objectContaining({ userId: MANAGER.id, title: BASE_OPTS.title })
    );
  });

  it('stores one notification record per recipient', async () => {
    mockGetUsersByRole.mockResolvedValue([OWNER]);

    await dispatchToTenantRecipients(TENANT_ID, BASE_OPTS);

    // At least one INSERT into notifications
    const insertCalls = mockQuery.mock.calls.filter(
      ([sql]: [string]) => sql.trim().toUpperCase().startsWith('INSERT INTO NOTIFICATIONS')
    );
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);

    // Notification stored with correct user_id and tenant_id
    const insertArgs = insertCalls[0][1] as unknown[];
    expect(insertArgs).toContain(TENANT_ID);
    expect(insertArgs).toContain(OWNER.id);
  });

  it('skips send when event_id + user_id already processed (idempotency)', async () => {
    mockGetUsersByRole.mockResolvedValue([OWNER]);
    // Simulate dedup row exists for this (event_id, user_id)
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('notification_dedup')) {
        return Promise.resolve({ rows: [{ event_id: EVENT_ID }] });
      }
      return Promise.resolve({ rows: [] });
    });

    await dispatchToTenantRecipients(TENANT_ID, BASE_OPTS);

    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it('does not re-send on redelivery (second call same eventId + userId)', async () => {
    mockGetUsersByRole.mockResolvedValue([OWNER]);
    let dedupInserted = false;

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('notification_dedup') && sql.toUpperCase().includes('SELECT')) {
        return Promise.resolve({ rows: dedupInserted ? [{ event_id: EVENT_ID }] : [] });
      }
      if (sql.includes('notification_dedup') && sql.toUpperCase().includes('INSERT')) {
        dedupInserted = true;
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    await dispatchToTenantRecipients(TENANT_ID, BASE_OPTS);
    await dispatchToTenantRecipients(TENANT_ID, BASE_OPTS);

    expect(mockSendPush).toHaveBeenCalledTimes(1);
  });

  it('still stores notification record even when no device tokens (skipped-no-token)', async () => {
    mockGetUsersByRole.mockResolvedValue([OWNER]);
    // sendPush is mocked to resolve without sending (no tokens found)
    mockSendPush.mockResolvedValue(undefined);

    await dispatchToTenantRecipients(TENANT_ID, BASE_OPTS);

    // Notification record should still be persisted
    const insertCalls = mockQuery.mock.calls.filter(
      ([sql]: [string]) => sql.trim().toUpperCase().startsWith('INSERT INTO NOTIFICATIONS')
    );
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('returns metrics with attempted, sent, skipped counts', async () => {
    mockGetUsersByRole.mockResolvedValue([OWNER, MANAGER]);

    const metrics = await dispatchToTenantRecipients(TENANT_ID, BASE_OPTS);

    expect(metrics.attempted).toBe(2);
    expect(metrics.sent + metrics.skipped).toBe(2);
  });

  it('handles auth client failure gracefully (empty recipients)', async () => {
    mockGetUsersByRole.mockResolvedValue([]);

    const metrics = await dispatchToTenantRecipients(TENANT_ID, BASE_OPTS);

    expect(mockSendPush).not.toHaveBeenCalled();
    expect(metrics.attempted).toBe(0);
  });
});

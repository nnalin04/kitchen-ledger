import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock modules before any imports that use them ─────────────────────────────

vi.mock('../../db', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../../providers/resend-email.provider', () => ({
  sendEmail:       vi.fn().mockResolvedValue(undefined),
  welcomeEmail:    vi.fn().mockReturnValue({
    subject: 'Welcome to KitchenLedger!',
    html:    '<p>Welcome</p>',
    text:    'Welcome',
  }),
  invitationEmail: vi.fn().mockReturnValue({
    subject: "You've been invited!",
    html:    '<p>Invite</p>',
    text:    'Invite',
  }),
}));

vi.mock('../../providers/expo-push.provider', () => ({
  sendPush: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { pool }                 from '../../db';
import { sendEmail, welcomeEmail, invitationEmail } from '../../providers/resend-email.provider';
import { sendPush }             from '../../providers/expo-push.provider';
import { dispatch, dispatchWelcomeEmail, dispatchInvitationEmail } from '../../providers/dispatcher';

const mockQuery = vi.mocked(pool.query);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: INSERT succeeds
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);
});

// ── dispatch() ────────────────────────────────────────────────────────────────

describe('dispatch()', () => {
  it('inserts a notification record into the DB', async () => {
    await dispatch({
      tenantId:  'tenant-123',
      userId:    'user-456',
      type:      'auth.user.registered',
      priority:  'informational',
      title:     'Welcome!',
      body:      'Your account is ready.',
      data:      { email: 'owner@example.com' },
      channels:  ['email'],
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO notifications');
    expect(params[0]).toBe('tenant-123');   // tenant_id
    expect(params[1]).toBe('user-456');     // user_id
    expect(params[2]).toBe('auth.user.registered'); // type
    expect(params[4]).toBe('Welcome!');     // title
  });

  it('calls sendPush when push channel is configured and userId is present', async () => {
    await dispatch({
      tenantId:  'tenant-123',
      userId:    'user-456',
      type:      'inventory.stock.low',
      priority:  'important',
      title:     'Low Stock',
      body:      'Onions running low',
      data:      { item_name: 'Onions' },
      channels:  ['push'],
    });

    expect(sendPush).toHaveBeenCalledOnce();
    expect(sendPush).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-456',
      title:  'Low Stock',
      body:   'Onions running low',
    }));
  });

  it('does NOT call sendPush when channels does not include push', async () => {
    await dispatch({
      tenantId:  'tenant-123',
      userId:    'user-456',
      type:      'report.generated',
      priority:  'informational',
      title:     'Report Ready',
      body:      'Your P&L is ready.',
      data:      {},
      channels:  ['email'], // no push
    });

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('does NOT call sendPush when userId is null', async () => {
    await dispatch({
      tenantId:  'tenant-123',
      userId:    null,
      type:      'inventory.stock.low',
      priority:  'important',
      title:     'Low Stock',
      body:      'Stock low',
      data:      {},
      channels:  ['push'],
    });

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('proceeds to next channel even if sendPush rejects', async () => {
    vi.mocked(sendPush).mockRejectedValueOnce(new Error('push service down'));

    // Should not throw — push failure is caught inside dispatch
    await expect(dispatch({
      tenantId:  'tenant-123',
      userId:    'user-456',
      type:      'inventory.stock.low',
      priority:  'important',
      title:     'Low Stock',
      body:      'Onions low',
      data:      {},
      channels:  ['push'],
    })).resolves.not.toThrow();
  });
});

// ── dispatchWelcomeEmail() ────────────────────────────────────────────────────

describe('dispatchWelcomeEmail()', () => {
  it('generates and sends a welcome email', async () => {
    await dispatchWelcomeEmail({
      userId:     'user-789',
      tenantId:   'tenant-123',
      email:      'owner@spicegarden.com',
      fullName:   'Ravi Kumar',
      tenantName: 'Spice Garden',
    });

    expect(welcomeEmail).toHaveBeenCalledWith(expect.objectContaining({
      fullName:       'Ravi Kumar',
      restaurantName: 'Spice Garden',
    }));

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@spicegarden.com',
    }));
  });

  it('also persists a notification record via dispatch()', async () => {
    await dispatchWelcomeEmail({
      userId:     'user-789',
      tenantId:   'tenant-123',
      email:      'owner@spicegarden.com',
      fullName:   'Ravi Kumar',
      tenantName: 'Spice Garden',
    });

    // dispatch() makes one INSERT call
    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO notifications');
  });
});

// ── dispatchInvitationEmail() ─────────────────────────────────────────────────

describe('dispatchInvitationEmail()', () => {
  it('generates and sends an invitation email with the invite token', async () => {
    await dispatchInvitationEmail({
      userId:      'user-999',
      tenantId:    'tenant-123',
      email:       'staff@spicegarden.com',
      fullName:    'Priya Singh',
      role:        'kitchen_staff',
      inviteToken: 'raw-invite-token-abc',
      tenantName:  'Spice Garden',
    });

    expect(invitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      fullName:    'Priya Singh',
      inviteToken: 'raw-invite-token-abc',
      role:        'kitchen_staff',
    }));

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'staff@spicegarden.com',
    }));
  });

  it('stores a notification record', async () => {
    await dispatchInvitationEmail({
      userId:      'user-999',
      tenantId:    'tenant-123',
      email:       'staff@spicegarden.com',
      fullName:    'Priya Singh',
      role:        'server',
      inviteToken: 'abc',
      tenantName:  'Spice Garden',
    });

    expect(mockQuery).toHaveBeenCalledOnce();
  });
});

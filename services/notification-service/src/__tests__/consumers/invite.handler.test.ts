import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockAck, mockNack, mockConsume, mockChannel, mockConnection,
  mockDispatchInvitationEmail,
  mockGetInviteLink,
} = vi.hoisted(() => {
  const mockAck  = vi.fn();
  const mockNack = vi.fn();
  const mockConsume = vi.fn();
  const mockChannel = {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    assertQueue:    vi.fn().mockResolvedValue(undefined),
    bindQueue:      vi.fn().mockResolvedValue(undefined),
    prefetch:       vi.fn(),
    consume:        mockConsume,
    close:          vi.fn().mockResolvedValue(undefined),
    ack:  mockAck,
    nack: mockNack,
  };
  const mockConnection = {
    createChannel: vi.fn().mockResolvedValue(mockChannel),
    close: vi.fn().mockResolvedValue(undefined),
    on:    vi.fn(),
  };
  const mockDispatchInvitationEmail = vi.fn().mockResolvedValue(undefined);
  const mockGetInviteLink           = vi.fn().mockResolvedValue(
    'http://localhost:3000/invite/accept?token=real-token-abc'
  );
  return {
    mockAck, mockNack, mockConsume, mockChannel, mockConnection,
    mockDispatchInvitationEmail,
    mockGetInviteLink,
  };
});

vi.mock('amqplib', () => ({
  default: { connect: vi.fn().mockResolvedValue(mockConnection) },
}));

vi.mock('../../providers/dispatcher', () => ({
  dispatch:                   vi.fn().mockResolvedValue(undefined),
  dispatchToTenantRecipients: vi.fn().mockResolvedValue({ attempted: 0, sent: 0, skipped: 0 }),
  dispatchWelcomeEmail:       vi.fn().mockResolvedValue(undefined),
  dispatchInvitationEmail:    mockDispatchInvitationEmail,
  dispatchPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../clients/auth.client', () => ({
  getUsersByRole: vi.fn().mockResolvedValue([]),
  getUserById:    vi.fn().mockResolvedValue(null),
  getInviteLink:  mockGetInviteLink,
}));

import { startEventConsumer, stopEventConsumer } from '../../consumers/event.consumer';
import { dispatchInvitationEmail } from '../../providers/dispatcher';
import { getInviteLink } from '../../clients/auth.client';

async function emit(envelope: Record<string, unknown>) {
  const handler = mockConsume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
  const msg = { content: Buffer.from(JSON.stringify(envelope)) };
  await handler(msg);
  return msg;
}

describe('auth.user.invited handler — NL-5 security fix', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    Object.assign(mockChannel, {
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue:    vi.fn().mockResolvedValue(undefined),
      bindQueue:      vi.fn().mockResolvedValue(undefined),
      prefetch:       vi.fn(),
      consume:        mockConsume,
      ack:  mockAck,
      nack: mockNack,
    });
    mockDispatchInvitationEmail.mockResolvedValue(undefined);
    mockGetInviteLink.mockResolvedValue('http://localhost:3000/invite/accept?token=real-token-abc');
    await startEventConsumer();
  });

  afterEach(async () => {
    await stopEventConsumer();
  });

  it('fetches invite URL from auth-service (not from payload)', async () => {
    const envelope = {
      event_type: 'auth.user.invited',
      tenant_id:  'tenant-abc',
      payload: {
        user_id:     'user-001',
        email:       'chef@spicegarden.com',
        full_name:   'Arjun Sharma',
        role:        'kitchen_staff',
        tenant_name: 'Spice Garden',
        // invite_token intentionally absent — security fix NL-5
      },
    };

    await emit(envelope);

    expect(getInviteLink).toHaveBeenCalledWith('user-001');
  });

  it('calls dispatchInvitationEmail with the URL returned by auth-service', async () => {
    const envelope = {
      event_type: 'auth.user.invited',
      tenant_id:  'tenant-abc',
      payload: {
        user_id:     'user-001',
        email:       'chef@spicegarden.com',
        full_name:   'Arjun Sharma',
        role:        'kitchen_staff',
        tenant_name: 'Spice Garden',
      },
    };

    await emit(envelope);

    expect(dispatchInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId:    'user-001',
        email:     'chef@spicegarden.com',
        fullName:  'Arjun Sharma',
        role:      'kitchen_staff',
        inviteUrl: 'http://localhost:3000/invite/accept?token=real-token-abc',
        tenantName: 'Spice Garden',
      })
    );
    expect(mockAck).toHaveBeenCalledOnce();
  });

  it('does NOT pass invite_token from event payload to dispatchInvitationEmail', async () => {
    // Even if a malformed event accidentally carries invite_token, it must not be used
    const envelope = {
      event_type: 'auth.user.invited',
      tenant_id:  'tenant-abc',
      payload: {
        user_id:      'user-001',
        email:        'chef@spicegarden.com',
        role:         'kitchen_staff',
        tenant_name:  'Spice Garden',
        invite_token: 'SHOULD-NOT-BE-USED', // malicious / stale payload
      },
    };

    await emit(envelope);

    // inviteUrl must be the one from auth-service, not constructed from invite_token
    expect(dispatchInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteUrl: 'http://localhost:3000/invite/accept?token=real-token-abc',
      })
    );
    expect(dispatchInvitationEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ inviteToken: 'SHOULD-NOT-BE-USED' })
    );
  });

  it('skips email and still acks when auth-service returns no valid invite link', async () => {
    mockGetInviteLink.mockResolvedValueOnce(null);

    const msg = await emit({
      event_type: 'auth.user.invited',
      tenant_id:  'tenant-abc',
      payload: {
        user_id: 'user-missing',
        email:   'ghost@spicegarden.com',
        role:    'server',
      },
    });

    expect(getInviteLink).toHaveBeenCalledWith('user-missing');
    expect(dispatchInvitationEmail).not.toHaveBeenCalled();
    // Not an error — consumer acks so the message doesn't go to DLQ
    expect(mockAck).toHaveBeenCalledWith(msg);
    expect(mockNack).not.toHaveBeenCalled();
  });

  it('NACKs when dispatchInvitationEmail throws', async () => {
    mockDispatchInvitationEmail.mockRejectedValueOnce(new Error('SMTP failure'));

    const msg = await emit({
      event_type: 'auth.user.invited',
      tenant_id:  'tenant-abc',
      payload: {
        user_id:     'user-001',
        email:       'chef@spicegarden.com',
        role:        'kitchen_staff',
        tenant_name: 'Spice Garden',
      },
    });

    expect(mockNack).toHaveBeenCalledWith(msg, false, false);
    expect(mockAck).not.toHaveBeenCalled();
  });
});

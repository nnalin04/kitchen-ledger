import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockAck, mockNack, mockConsume, mockChannel, mockConnection,
  mockDispatchPasswordResetEmail, mockDispatchToTenantRecipients,
  mockDispatchWelcomeEmail, mockDispatchInvitationEmail,
} = vi.hoisted(() => {
  const mockAck = vi.fn();
  const mockNack = vi.fn();
  const mockConsume = vi.fn();
  const mockChannel = {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    assertQueue:    vi.fn().mockResolvedValue(undefined),
    bindQueue:      vi.fn().mockResolvedValue(undefined),
    prefetch:       vi.fn(),
    consume:        mockConsume,
    close:          vi.fn().mockResolvedValue(undefined),
    ack: mockAck,
    nack: mockNack,
  };
  const mockConnection = {
    createChannel: vi.fn().mockResolvedValue(mockChannel),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  const mockDispatchPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
  const mockDispatchToTenantRecipients  = vi.fn().mockResolvedValue({ attempted: 0, sent: 0, skipped: 0 });
  const mockDispatchWelcomeEmail        = vi.fn().mockResolvedValue(undefined);
  const mockDispatchInvitationEmail     = vi.fn().mockResolvedValue(undefined);
  return {
    mockAck, mockNack, mockConsume, mockChannel, mockConnection,
    mockDispatchPasswordResetEmail, mockDispatchToTenantRecipients,
    mockDispatchWelcomeEmail, mockDispatchInvitationEmail,
  };
});

vi.mock('amqplib', () => ({
  default: { connect: vi.fn().mockResolvedValue(mockConnection) },
}));

vi.mock('../../providers/dispatcher', () => ({
  dispatch:                   vi.fn().mockResolvedValue(undefined),
  dispatchToTenantRecipients: mockDispatchToTenantRecipients,
  dispatchWelcomeEmail:       mockDispatchWelcomeEmail,
  dispatchInvitationEmail:    mockDispatchInvitationEmail,
  dispatchPasswordResetEmail: mockDispatchPasswordResetEmail,
}));

import { startEventConsumer, stopEventConsumer } from '../../consumers/event.consumer';
import { dispatchPasswordResetEmail } from '../../providers/dispatcher';

async function emit(envelope: Record<string, unknown>) {
  const handler = mockConsume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
  const msg = { content: Buffer.from(JSON.stringify(envelope)) };
  await handler(msg);
  return msg;
}

describe('auth.password.reset.requested handler', () => {
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
    mockDispatchPasswordResetEmail.mockResolvedValue(undefined);
    await startEventConsumer();
  });

  afterEach(async () => {
    await stopEventConsumer();
  });

  it('routes auth.password.reset.requested to dispatchPasswordResetEmail', async () => {
    const envelope = {
      event_id:    'evt-reset-1',
      event_type:  'auth.password.reset.requested',
      tenant_id:   'tenant-abc',
      produced_by: 'auth-service',
      produced_at: '2026-04-20T10:00:00Z',
      version:     '1.0',
      payload: {
        user_id:     'user-1',
        email:       'owner@restaurant.com',
        full_name:   'Ravi Kumar',
        reset_token: 'secret-token-abc123',
      },
    };

    const msg = await emit(envelope);

    expect(mockDispatchPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId:     'user-1',
        email:      'owner@restaurant.com',
        fullName:   'Ravi Kumar',
        resetToken: 'secret-token-abc123',
      })
    );
    expect(mockAck).toHaveBeenCalledWith(msg);
    expect(mockNack).not.toHaveBeenCalled();
  });

  it('binds auth.password.reset.requested routing key', async () => {
    const boundKeys = mockChannel.bindQueue.mock.calls.map(([,, key]: string[]) => key);
    expect(boundKeys).toContain('auth.password.reset.requested');
  });

  it('NACKs when dispatchPasswordResetEmail throws', async () => {
    mockDispatchPasswordResetEmail.mockRejectedValue(new Error('email failed'));

    const msg = await emit({
      event_type: 'auth.password.reset.requested',
      tenant_id:  'tenant-abc',
      payload: { user_id: 'user-1', email: 'u@r.com', reset_token: 'tok' },
    });

    expect(mockNack).toHaveBeenCalledWith(msg, false, false);
    expect(mockAck).not.toHaveBeenCalled();
  });
});

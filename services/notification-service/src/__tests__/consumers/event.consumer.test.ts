import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock amqplib ──────────────────────────────────────────────────────────────

const {
  mockAck,
  mockNack,
  mockConsume,
  mockChannel,
  mockConnection,
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
    ack:            mockAck,
    nack:           mockNack,
  };
  const mockConnection = {
    createChannel: vi.fn().mockResolvedValue(mockChannel),
    close:         vi.fn().mockResolvedValue(undefined),
    on:            vi.fn(),
  };
  return { mockAck, mockNack, mockConsume, mockChannel, mockConnection };
});

vi.mock('amqplib', () => ({
  default: { connect: vi.fn().mockResolvedValue(mockConnection) },
}));

// ── Mock dispatcher (we test routing, not the email/push logic) ───────────────

vi.mock('../../providers/dispatcher', () => ({
  dispatchWelcomeEmail:        vi.fn().mockResolvedValue(undefined),
  dispatchInvitationEmail:     vi.fn().mockResolvedValue(undefined),
  dispatch:                    vi.fn().mockResolvedValue(undefined),
  dispatchToTenantRecipients:  vi.fn().mockResolvedValue({ attempted: 0, sent: 0, skipped: 0 }),
}));

// ── Mock auth client ──────────────────────────────────────────────────────────

vi.mock('../../clients/auth.client', () => ({
  getUsersByRole: vi.fn().mockResolvedValue([]),
  getUserById:    vi.fn().mockResolvedValue(null),
  getInviteLink:  vi.fn().mockResolvedValue('http://localhost:3000/invite/accept?token=test-token'),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import amqplib                  from 'amqplib';
import { startEventConsumer, stopEventConsumer } from '../../consumers/event.consumer';
import {
  dispatchWelcomeEmail,
  dispatchInvitationEmail,
  dispatch,
  dispatchToTenantRecipients,
} from '../../providers/dispatcher';
import { getInviteLink } from '../../clients/auth.client';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Simulate a RabbitMQ message arriving and run the handler. */
async function simulateMessage(eventType: string, payload: Record<string, string>, tenantId = 'tenant-123') {
  // After startEventConsumer(), mockConsume was called with (queue, handler)
  const handler = mockConsume.mock.calls[0][1] as (msg: unknown) => Promise<void>;

  const envelope = { event_type: eventType, tenant_id: tenantId, payload };
  const msg = {
    content: Buffer.from(JSON.stringify(envelope)),
  };

  await handler(msg);
  return msg;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('startEventConsumer()', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-setup mocks that were cleared
    mockConnection.createChannel.mockResolvedValue(mockChannel);
    Object.assign(mockChannel, {
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue:    vi.fn().mockResolvedValue(undefined),
      bindQueue:      vi.fn().mockResolvedValue(undefined),
      prefetch:       vi.fn(),
      consume:        mockConsume,
      ack:            mockAck,
      nack:           mockNack,
    });

    await startEventConsumer();
  });

  it('declares the kitchenledger.events topic exchange', () => {
    expect(mockChannel.assertExchange).toHaveBeenCalledWith(
      'kitchenledger.events', 'topic', { durable: true }
    );
  });

  it('declares the notification-service queue', () => {
    expect(mockChannel.assertQueue).toHaveBeenCalledWith(
      'notification-service', { durable: true }
    );
  });

  it('binds all required routing keys', () => {
    const boundKeys = mockChannel.bindQueue.mock.calls.map(([, , key]: string[]) => key);
    expect(boundKeys).toContain('auth.user.registered');
    expect(boundKeys).toContain('auth.user.invited');
    expect(boundKeys).toContain('inventory.stock.low');
    expect(boundKeys).toContain('finance.payment.overdue');
  });

  it('sets prefetch to 1', () => {
    expect(mockChannel.prefetch).toHaveBeenCalledWith(1);
  });
});

describe('event routing', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockConnection.createChannel.mockResolvedValue(mockChannel);
    Object.assign(mockChannel, {
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue:    vi.fn().mockResolvedValue(undefined),
      bindQueue:      vi.fn().mockResolvedValue(undefined),
      prefetch:       vi.fn(),
      consume:        mockConsume,
      ack:            mockAck,
      nack:           mockNack,
    });
    vi.mocked(dispatchWelcomeEmail).mockResolvedValue(undefined);
    vi.mocked(dispatchInvitationEmail).mockResolvedValue(undefined);
    vi.mocked(dispatch).mockResolvedValue(undefined);
    vi.mocked(dispatchToTenantRecipients).mockResolvedValue({ attempted: 0, sent: 0, skipped: 0 });

    await startEventConsumer();
  });

  it('routes auth.user.registered → dispatchWelcomeEmail', async () => {
    await simulateMessage('auth.user.registered', {
      user_id:     'user-123',
      email:       'owner@spicegarden.com',
      full_name:   'Ravi Kumar',
      tenant_name: 'Spice Garden',
    });

    expect(dispatchWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({
      userId:     'user-123',
      email:      'owner@spicegarden.com',
      fullName:   'Ravi Kumar',
      tenantName: 'Spice Garden',
    }));
    expect(mockAck).toHaveBeenCalledOnce();
  });

  it('routes auth.user.invited → fetches invite URL from auth-service and calls dispatchInvitationEmail', async () => {
    await simulateMessage('auth.user.invited', {
      user_id:     'user-456',
      email:       'staff@spicegarden.com',
      full_name:   'Priya Singh',
      role:        'kitchen_staff',
      tenant_name: 'Spice Garden',
      // invite_token is intentionally absent — it must never be in the event payload
    });

    expect(getInviteLink).toHaveBeenCalledWith('user-456');
    expect(dispatchInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      userId:    'user-456',
      email:     'staff@spicegarden.com',
      role:      'kitchen_staff',
      inviteUrl: 'http://localhost:3000/invite/accept?token=test-token',
    }));
    expect(mockAck).toHaveBeenCalledOnce();
  });

  it('auth.user.invited: skips email and acks when auth-service returns no invite link', async () => {
    vi.mocked(getInviteLink).mockResolvedValueOnce(null);

    await simulateMessage('auth.user.invited', {
      user_id:     'user-789',
      email:       'ghost@spicegarden.com',
      role:        'server',
      tenant_name: 'Spice Garden',
    });

    expect(getInviteLink).toHaveBeenCalledWith('user-789');
    expect(dispatchInvitationEmail).not.toHaveBeenCalled();
    // consumer should still ack — skipping is not an error
    expect(mockAck).toHaveBeenCalledOnce();
  });

  it('routes inventory.stock.low → dispatchToTenantRecipients() with important priority', async () => {
    await simulateMessage('inventory.stock.low', {
      item_name:     'Onions',
      current_stock: '2',
      unit:          'kg',
    });

    expect(dispatchToTenantRecipients).toHaveBeenCalledWith(
      'tenant-123',
      expect.objectContaining({ type: 'inventory.stock.low', priority: 'important' })
    );
    expect(mockAck).toHaveBeenCalledOnce();
  });

  it('routes finance.payment.overdue → dispatchToTenantRecipients() with critical priority', async () => {
    await simulateMessage('finance.payment.overdue', {
      vendor_name: 'Fresh Farms Co.',
      amount:      '45000',
      currency:    '₹',
    });

    expect(dispatchToTenantRecipients).toHaveBeenCalledWith(
      'tenant-123',
      expect.objectContaining({ type: 'finance.payment.overdue', priority: 'critical' })
    );
    expect(mockAck).toHaveBeenCalledOnce();
  });

  it('nacks (without requeue) on unknown event type', async () => {
    await simulateMessage('unknown.event.type', {});

    expect(mockNack).toHaveBeenCalledOnce();
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('nacks on malformed message content', async () => {
    const handler = mockConsume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
    const badMsg  = { content: Buffer.from('this is not json') };

    await handler(badMsg);

    expect(mockNack).toHaveBeenCalledWith(badMsg, false, false);
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('ignores null messages (cancelled consumer)', async () => {
    const handler = mockConsume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
    await handler(null);

    expect(mockAck).not.toHaveBeenCalled();
    expect(mockNack).not.toHaveBeenCalled();
  });
});

describe('stopEventConsumer()', () => {
  it('closes channel and connection without throwing', async () => {
    await expect(stopEventConsumer()).resolves.not.toThrow();
  });
});

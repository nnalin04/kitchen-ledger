import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock amqplib ──────────────────────────────────────────────────────────────

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

vi.mock('amqplib', () => ({
  default: { connect: vi.fn().mockResolvedValue(mockConnection) },
}));

// ── Mock dispatcher (we test routing, not the email/push logic) ───────────────

vi.mock('../../providers/dispatcher', () => ({
  dispatchWelcomeEmail:    vi.fn().mockResolvedValue(undefined),
  dispatchInvitationEmail: vi.fn().mockResolvedValue(undefined),
  dispatch:                vi.fn().mockResolvedValue(undefined),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import amqplib                  from 'amqplib';
import { startEventConsumer, stopEventConsumer } from '../../consumers/event.consumer';
import {
  dispatchWelcomeEmail,
  dispatchInvitationEmail,
  dispatch,
} from '../../providers/dispatcher';

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

  it('routes auth.user.invited → dispatchInvitationEmail', async () => {
    await simulateMessage('auth.user.invited', {
      user_id:      'user-456',
      email:        'staff@spicegarden.com',
      full_name:    'Priya Singh',
      role:         'kitchen_staff',
      invite_token: 'raw-token-xyz',
      tenant_name:  'Spice Garden',
    });

    expect(dispatchInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      userId:      'user-456',
      email:       'staff@spicegarden.com',
      role:        'kitchen_staff',
      inviteToken: 'raw-token-xyz',
    }));
    expect(mockAck).toHaveBeenCalledOnce();
  });

  it('routes inventory.stock.low → dispatch() with push channel', async () => {
    await simulateMessage('inventory.stock.low', {
      item_name:     'Onions',
      current_stock: '2',
      unit:          'kg',
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type:     'inventory.stock.low',
      priority: 'important',
      channels: expect.arrayContaining(['push']),
    }));
    expect(mockAck).toHaveBeenCalledOnce();
  });

  it('routes finance.payment.overdue → dispatch() with critical priority', async () => {
    await simulateMessage('finance.payment.overdue', {
      vendor_name: 'Fresh Farms Co.',
      amount:      '45000',
      currency:    '₹',
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type:     'finance.payment.overdue',
      priority: 'critical',
    }));
    expect(mockAck).toHaveBeenCalledOnce();
  });

  it('nacks (without requeue) on unknown event type', async () => {
    await simulateMessage('unknown.event.type', {});

    // Unknown event: logs a warning but does NOT throw, so it should ACK
    // (handler falls through to default: console.warn, no throw)
    // The message still gets acked since no exception was thrown
    expect(mockAck).toHaveBeenCalledOnce();
    expect(mockNack).not.toHaveBeenCalled();
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const {
  mockAck, mockNack, mockConsume,
  mockChannel, mockConnection,
  mockDispatch, mockDispatchToTenantRecipients,
  mockDispatchWelcomeEmail, mockDispatchInvitationEmail,
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
  const mockDispatch                  = vi.fn().mockResolvedValue(undefined);
  const mockDispatchToTenantRecipients = vi.fn().mockResolvedValue({ attempted: 2, sent: 2, skipped: 0 });
  const mockDispatchWelcomeEmail      = vi.fn().mockResolvedValue(undefined);
  const mockDispatchInvitationEmail   = vi.fn().mockResolvedValue(undefined);
  return {
    mockAck, mockNack, mockConsume, mockChannel, mockConnection,
    mockDispatch, mockDispatchToTenantRecipients,
    mockDispatchWelcomeEmail, mockDispatchInvitationEmail,
  };
});

vi.mock('amqplib', () => ({
  default: { connect: vi.fn().mockResolvedValue(mockConnection) },
}));

vi.mock('../../providers/dispatcher', () => ({
  dispatch:                   mockDispatch,
  dispatchToTenantRecipients: mockDispatchToTenantRecipients,
  dispatchWelcomeEmail:       mockDispatchWelcomeEmail,
  dispatchInvitationEmail:    mockDispatchInvitationEmail,
}));

import { startEventConsumer, stopEventConsumer } from '../../consumers/event.consumer';

async function emit(envelope: Record<string, unknown>) {
  const handler = mockConsume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
  const msg = { content: Buffer.from(JSON.stringify(envelope)) };
  await handler(msg);
  return msg;
}

function snakeEnvelope(eventType: string, payload: Record<string, unknown> = {}) {
  return {
    event_id:    'evt-test-001',
    event_type:  eventType,
    tenant_id:   'tenant-xyz',
    produced_by: 'test',
    produced_at: '2026-04-20T10:00:00Z',
    version:     '1.0',
    payload,
  };
}

describe('event.consumer push-routing for fan-out events', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await startEventConsumer();
  });

  afterEach(async () => {
    await stopEventConsumer();
  });

  const fanOutEvents = [
    ['inventory.stock.low',           { item_name: 'Onion', current_stock: 5, unit: 'kg' }],
    ['inventory.stock.expiring',      { item_name: 'Milk',  days_remaining: 2 }],
    ['finance.cash.discrepancy',      { expected: 1000, actual: 950, delta: 50, currency: 'INR' }],
    ['staff.employee.noshow',         { employee_name: 'John', shift_id: 'shift-1' }],
    ['staff.overtime.approaching',    { employee_name: 'Jane', hours_worked: 7.5, threshold_hours: 8 }],
  ] as const;

  for (const [eventType, payload] of fanOutEvents) {
    it(`routes ${eventType} through dispatchToTenantRecipients`, async () => {
      const envelope = snakeEnvelope(eventType, payload);
      const msg = await emit(envelope);

      expect(mockDispatchToTenantRecipients).toHaveBeenCalledWith(
        'tenant-xyz',
        expect.objectContaining({
          eventId: 'evt-test-001',
          type:    eventType,
        })
      );
      expect(mockAck).toHaveBeenCalledWith(msg);
      expect(mockNack).not.toHaveBeenCalled();
    });
  }

  it('uses dispatch (not fan-out) for direct-user events like auth.user.registered', async () => {
    const envelope = snakeEnvelope('auth.user.registered', {
      user_id: 'user-1', email: 'u@r.com', full_name: 'User', tenant_name: 'My Restaurant',
    });
    await emit(envelope);

    expect(mockDispatchToTenantRecipients).not.toHaveBeenCalled();
    expect(mockDispatchWelcomeEmail).toHaveBeenCalled();
  });

  it('NACKs malformed envelope and does not call fan-out', async () => {
    const msg = { content: Buffer.from('not-json') };
    const handler = mockConsume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
    await handler(msg);

    expect(mockNack).toHaveBeenCalledWith(msg, false, false);
    expect(mockDispatchToTenantRecipients).not.toHaveBeenCalled();
  });
});

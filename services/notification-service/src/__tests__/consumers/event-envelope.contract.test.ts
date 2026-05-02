import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockAck,
  mockNack,
  mockConsume,
  mockChannel,
  mockConnection,
} = vi.hoisted(() => {
  const mockAck = vi.fn();
  const mockNack = vi.fn();
  const mockConsume = vi.fn();
  const mockChannel = {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    assertQueue: vi.fn().mockResolvedValue(undefined),
    bindQueue: vi.fn().mockResolvedValue(undefined),
    prefetch: vi.fn(),
    consume: mockConsume,
    close: vi.fn().mockResolvedValue(undefined),
    ack: mockAck,
    nack: mockNack,
  };
  const mockConnection = {
    createChannel: vi.fn().mockResolvedValue(mockChannel),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  return { mockAck, mockNack, mockConsume, mockChannel, mockConnection };
});

vi.mock('amqplib', () => ({
  default: { connect: vi.fn().mockResolvedValue(mockConnection) },
}));

vi.mock('../../providers/dispatcher', () => ({
  dispatchWelcomeEmail:        vi.fn().mockResolvedValue(undefined),
  dispatchInvitationEmail:     vi.fn().mockResolvedValue(undefined),
  dispatch:                    vi.fn().mockResolvedValue(undefined),
  dispatchToTenantRecipients:  vi.fn().mockResolvedValue({ attempted: 0, sent: 0, skipped: 0 }),
}));

import { startEventConsumer, stopEventConsumer } from '../../consumers/event.consumer';
import { dispatchWelcomeEmail, dispatch, dispatchToTenantRecipients } from '../../providers/dispatcher';

async function emitEnvelope(envelope: Record<string, unknown>) {
  const handler = mockConsume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
  const msg = { content: Buffer.from(JSON.stringify(envelope)) };
  await handler(msg);
  return msg;
}

describe('event envelope contract', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: { mockRestore: () => void; [key: string]: any };

  beforeEach(async () => {
    vi.clearAllMocks();
    Object.assign(mockChannel, {
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
      prefetch: vi.fn(),
      consume: mockConsume,
      ack: mockAck,
      nack: mockNack,
    });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await startEventConsumer();
  });

  afterEach(async () => {
    consoleErrorSpy.mockRestore();
    await stopEventConsumer();
  });

  it('accepts snake_case envelope from auth-service publisher', async () => {
    await emitEnvelope({
      event_id: 'evt-1',
      event_type: 'auth.user.registered',
      tenant_id: 'tenant-1',
      produced_by: 'auth-service',
      produced_at: '2026-04-20T10:00:00Z',
      version: '1.0',
      payload: {
        user_id: 'user-1',
        email: 'owner@kitchenledger.test',
        full_name: 'Owner User',
        tenant_name: 'Kitchen Ledger',
      },
    });

    expect(dispatchWelcomeEmail).toHaveBeenCalledOnce();
    expect(mockAck).toHaveBeenCalledOnce();
    expect(mockNack).not.toHaveBeenCalled();
  });

  it('accepts camelCase envelope from Java publishers during migration window', async () => {
    await emitEnvelope({
      eventId: 'evt-2',
      eventType: 'inventory.stock.low',
      tenantId: 'tenant-2',
      producedBy: 'inventory-service',
      producedAt: '2026-04-20T10:00:00Z',
      version: '1.0',
      payload: {
        item_name: 'Tomato',
        current_stock: '1',
        unit: 'kg',
      },
    });

    expect(dispatchToTenantRecipients).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'inventory.stock.low' })
    );
    expect(mockAck).toHaveBeenCalledOnce();
    expect(mockNack).not.toHaveBeenCalled();
  });

  it('accepts camelCase finance/staff envelopes and routes by event type', async () => {
    await emitEnvelope({
      eventType: 'finance.cash.discrepancy',
      tenantId: 'tenant-3',
      payload: { variance_direction: 'SHORT', variance: '-250.00' },
    });
    await emitEnvelope({
      eventType: 'staff.employee.noshow',
      tenantId: 'tenant-3',
      payload: { employee_name: 'Sam', shift_start: '17:00', shift_date: '2026-04-20' },
    });

    expect(dispatchToTenantRecipients).toHaveBeenCalledWith(
      'tenant-3', expect.objectContaining({ type: 'finance.cash.discrepancy' })
    );
    expect(dispatchToTenantRecipients).toHaveBeenCalledWith(
      'tenant-3', expect.objectContaining({ type: 'staff.employee.noshow' })
    );
    expect(mockNack).not.toHaveBeenCalled();
  });

  it('nacks malformed envelope and logs structured error', async () => {
    const msg = await emitEnvelope({
      event_type: 'inventory.stock.low',
      payload: { item_name: 'Onion' },
    });

    expect(mockAck).not.toHaveBeenCalled();
    expect(mockNack).toHaveBeenCalledWith(msg, false, false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to process event envelope',
      expect.objectContaining({ reason: expect.any(String), raw: expect.any(String) })
    );
  });

  it('nacks unknown event type so it can flow to DLQ', async () => {
    const msg = await emitEnvelope({
      event_type: 'unknown.event',
      tenant_id: 'tenant-5',
      payload: {},
    });

    expect(mockAck).not.toHaveBeenCalled();
    expect(mockNack).toHaveBeenCalledWith(msg, false, false);
  });
});

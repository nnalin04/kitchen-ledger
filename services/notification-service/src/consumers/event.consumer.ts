import amqplib, { Connection, Channel } from 'amqplib';
import { config } from '../config';
import {
  dispatchWelcomeEmail,
  dispatchInvitationEmail,
  dispatch,
} from '../providers/dispatcher';

const EXCHANGE   = 'kitchenledger.events';
const QUEUE_NAME = 'notification-service';

// All event types this service subscribes to
const BINDINGS = [
  'auth.user.registered',
  'auth.user.invited',
  'inventory.stock.low',
  'inventory.stock.expiring',
  'inventory.po.sent',
  'inventory.price.alert',
  'finance.dsr.reconciled',
  'finance.payment.overdue',
  'finance.expense.created',
  'finance.cash.discrepancy',
  'report.generated',
  'staff.employee.hired',
  'staff.employee.noshow',
  'staff.overtime.approaching',
  'inventory.receipt.confirmed',
  'staff.certification.expiring',
];

let connection: Connection | null = null;
let channel: Channel | null = null;

export async function startEventConsumer(): Promise<void> {
  connection = await amqplib.connect(config.RABBITMQ_URL);
  channel    = await connection.createChannel();

  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(QUEUE_NAME, { durable: true });

  for (const routingKey of BINDINGS) {
    await channel.bindQueue(QUEUE_NAME, EXCHANGE, routingKey);
  }

  // Process one message at a time (prefetch = 1)
  channel.prefetch(1);

  channel.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString()) as {
        event_type: string;
        tenant_id: string;
        payload: Record<string, string>;
      };

      await handleEvent(event.event_type, event.tenant_id, event.payload);
      channel!.ack(msg);
    } catch (err) {
      console.error('Failed to process event:', err);
      // Reject without re-queue → goes to dead-letter (if configured) or is dropped
      channel!.nack(msg, false, false);
    }
  });

  console.log('RabbitMQ consumer started, listening on queue:', QUEUE_NAME);

  connection.on('error', (err) => {
    console.error('RabbitMQ connection error:', err);
  });
  connection.on('close', () => {
    console.warn('RabbitMQ connection closed — reconnecting in 5s');
    setTimeout(startEventConsumer, 5_000);
  });
}

async function handleEvent(
  eventType: string,
  tenantId: string,
  payload: Record<string, string>
): Promise<void> {
  switch (eventType) {
    case 'auth.user.registered':
      await dispatchWelcomeEmail({
        userId:     payload.user_id,
        tenantId,
        email:      payload.email,
        fullName:   payload.full_name,
        tenantName: payload.tenant_name,
      });
      break;

    case 'auth.user.invited':
      await dispatchInvitationEmail({
        userId:      payload.user_id,
        tenantId,
        email:       payload.email,
        fullName:    payload.full_name ?? payload.email,
        role:        payload.role,
        inviteToken: payload.invite_token,
        tenantName:  payload.tenant_name ?? 'your restaurant',
      });
      break;

    case 'inventory.stock.low':
      await dispatch({
        tenantId,
        userId: null, // fan-out to owner/manager handled in Phase 4
        type: eventType,
        priority: 'important',
        title: 'Low Stock Alert',
        body: `${payload.item_name} is running low (${payload.current_stock} ${payload.unit} remaining)`,
        data: payload,
        channels: ['push'],
      });
      break;

    case 'inventory.stock.expiring':
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'important',
        title: 'Item Expiring Soon',
        body: `${payload.item_name} expires in ${payload.days_remaining} day(s)`,
        data: payload,
        channels: ['push'],
      });
      break;

    case 'inventory.po.sent':
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'informational',
        title: 'Purchase Order Sent',
        body: `PO ${payload.po_number} sent via ${payload.sent_via} (total: ${payload.total_amount})`,
        data: payload,
        channels: ['push'],
      });
      break;

    case 'inventory.price.alert':
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'important',
        title: 'Price Alert',
        body: `${payload.item_name} price changed by ${payload.delta_percent}% → ${payload.new_price}`,
        data: payload,
        channels: ['push'],
      });
      break;

    case 'finance.payment.overdue':
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'critical',
        title: 'Payment Overdue',
        // publisher sends vendor_id not vendor_name; fall back gracefully
        body: `Payment (vendor: ${payload.vendor_id}) is overdue — ${payload.currency} ${payload.amount}`,
        data: payload,
        channels: ['push', 'email'],
      });
      break;

    case 'finance.dsr.reconciled':
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'informational',
        title: 'Daily Report Reconciled',
        // publisher sends report_date (not date); support both during rollout
        body: `Sales report for ${payload.report_date ?? payload.date} reconciled. Net: ${payload.currency} ${payload.net_sales}`,
        data: payload,
        channels: ['push'],
      });
      break;

    case 'staff.employee.hired':
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'informational',
        title: 'New Team Member',
        body: `${payload.full_name} has been added as ${payload.role}. Complete their onboarding profile.`,
        data: payload,
        channels: ['push'],
      });
      break;

    case 'report.generated':
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'informational',
        title: 'Your Report is Ready',
        body: `${payload.report_name} has been generated and is ready to download`,
        data: payload,
        channels: ['push'],
      });
      break;

    case 'staff.employee.noshow':
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'important',
        title: 'Employee No-Show',
        body: `${payload.employee_name} did not clock in for their ${payload.shift_start} shift on ${payload.shift_date}.`,
        data: payload,
        channels: ['push'],
      });
      break;

    case 'staff.overtime.approaching':
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'important',
        title: 'Overtime Alert',
        body: `${payload.employee_name} has worked ${payload.hours_this_week}h this week. Overtime in ${payload.hours_until_overtime}h.`,
        data: payload,
        channels: ['push'],
      });
      break;

    case 'finance.expense.created':
      // Audit log — no push notification by default; extend later for budget alerts
      console.info('Expense created event received for tenant', tenantId);
      break;

    case 'inventory.receipt.confirmed':
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'informational',
        title: 'Delivery Confirmed',
        body: `Stock receipt confirmed. Inventory has been updated.`,
        data: payload,
        channels: ['push'],
      });
      break;

    case 'finance.cash.discrepancy': {
      const direction = payload.variance_direction === 'SHORT' ? 'SHORT' : 'OVER';
      const amount    = Math.abs(parseFloat(payload.variance ?? '0')).toFixed(2);
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'critical',
        title: `Cash ${direction} — ₹${amount}`,
        body: `Today's cash count is ₹${amount} ${direction.toLowerCase()}. Immediate review required.`,
        data: payload,
        channels: ['push'],
      });
      break;
    }

    case 'staff.certification.expiring':
      await dispatch({
        tenantId,
        userId: null,
        type: eventType,
        priority: 'important',
        title: 'Certification Expiring Soon',
        body: `${payload.employee_name}'s ${payload.cert_name} expires on ${payload.expiry_date}`,
        data: payload,
        channels: ['push'],
      });
      break;

    default:
      console.warn('Unhandled event type:', eventType);
  }
}

export async function stopEventConsumer(): Promise<void> {
  try {
    await channel?.close();
    await connection?.close();
  } catch {
    // Ignore close errors on shutdown
  }
}

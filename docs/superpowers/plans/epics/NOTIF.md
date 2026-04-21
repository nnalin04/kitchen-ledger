# EPIC: NOTIF — Notification Service

**Phase:** 3 | **Weeks:** 9–11
**Service:** `services/notification-service` (Node.js 22 + Fastify 4 + TypeScript) | **Port:** 8086
**Goal:** Dispatch-only service. Listens to all RabbitMQ events, translates them into push notifications (Expo), emails (Resend), and notification DB records. No business logic.
**Depends on:** INFRA-5 (skeleton), Auth Service (user/role lookup), RabbitMQ running with all queues declared
**Blocks:** Push notifications in mobile app, email delivery for invite/reset flows

---

## NOTIF-1: Database Schema & Repository Layer

- [ ] Create `migrations/001_notifications.sql` (exact from TRD §4.10):
  - `notifications` — id UUID, tenant_id UUID, user_id UUID (NULL = all users in tenant), type VARCHAR(100), priority CHECK('critical','important','informational'), title VARCHAR(255), body TEXT, data JSONB, channels JSONB (array: ['push','email']), read_at TIMESTAMPTZ; index on (user_id, read_at)
  - `device_tokens` — id UUID, user_id UUID, tenant_id UUID, token VARCHAR(500) UNIQUE, platform CHECK('ios','android','web'), is_active BOOLEAN, last_used_at TIMESTAMPTZ; index on (user_id) WHERE is_active=TRUE
- [ ] `src/repositories/notification.repository.ts`:
  - `create(data)` — insert notification row, return id
  - `listForUser(userId, tenantId, page, pageSize)` — paginated, unread first
  - `markRead(id, userId)` — update `read_at = NOW()` only if user_id matches
  - `markAllRead(userId, tenantId)` — bulk update
  - `getUnreadCount(userId, tenantId)` → number
- [ ] `src/repositories/device-token.repository.ts`:
  - `upsertToken(userId, tenantId, token, platform)` — ON CONFLICT(token) update last_used_at
  - `getActiveTokens(userId)` → array of active tokens
  - `deactivateToken(token)` — set is_active=false (called when Expo returns `DeviceNotRegistered`)
- [ ] **Test:** Create notification → retrieve paginated → mark read → unread count decrements.

---

## NOTIF-2: RabbitMQ Event Consumer

- [ ] `src/consumers/event.consumer.ts` (exact from TRD §4.11):
  - On startup: connect to RabbitMQ, assert `notification-service` queue (durable), bind to all 7 routing keys
  - `EVENT_HANDLERS` map: routing key → `NotificationTemplate { title, body (string | fn), priority, channels, targetRole?, emailTemplate? }`
  - Handler entries:
    - `auth.user.registered` → email `welcome`, informational
    - `auth.user.invited` → email `invitation`, important; body uses `payload.inviter_name` + `payload.restaurant_name`
    - `inventory.stock.low` → push only, important; body = `"{item_name} is running low ({current_stock} {unit} remaining)"`, targetRole=owner+manager
    - `inventory.stock.expiring` → push only, important; body = `"{item_name} expires in {days_remaining} day(s)"`, targetRole=owner+manager+kitchen_staff
    - `finance.dsr.reconciled` → push only, informational; body = `"Sales report for {date} reconciled. Net sales: {currency}{net_sales}"`, targetRole=owner
    - `finance.payment.overdue` → push + email, critical; targetRole=owner
    - `report.generated` → push + email, informational; body = `"{report_name} is ready to download"`
  - `processEvent(event, template)`:
    1. Resolve target users: call Auth Service `GET /internal/auth/users?tenant_id={id}&role={role}` (for each targetRole)
    2. For each user: `notificationRepo.create(...)` then dispatch channels
    3. Ack message on success; nack without requeue after 3 failures (dead-letter)
  - Consumer idempotency: Redis key `processed:notif:{event_id}` with 24h TTL; skip if already processed
- [ ] **Test:** Publish `inventory.stock.low` event → notification DB records created for owner + manager users. Same event published twice → processed only once.

---

## NOTIF-3: Expo Push Provider

- [ ] `src/providers/expo-push.provider.ts` (exact from TRD §4.12):
  - `expo-server-sdk` instance with `EXPO_ACCESS_TOKEN`
  - `send(userId, notification)`:
    1. `tokenRepo.getActiveTokens(userId)` → filter with `Expo.isExpoPushToken()`
    2. Build `ExpoPushMessage` array: title, body, data, priority (high if critical), sound (default if critical), badge=1
    3. `expo.chunkPushNotifications(messages)` → send each chunk
    4. Handle receipts: `DeviceNotRegistered` → `tokenRepo.deactivateToken(t)`; `MessageTooBig` → log warning
    5. Log errors per device; do NOT throw (partial delivery is acceptable)
- [ ] **Test:** Register device token → mock Expo SDK send → verify message payload. `DeviceNotRegistered` receipt → token deactivated in DB.

---

## NOTIF-4: Email Provider (Resend)

- [ ] `src/providers/resend-email.provider.ts`:
  - `resend` SDK client with `RESEND_API_KEY`
  - `sendEmail(to, templateName, payload)` — switch on templateName:
    - `welcome`: subject "Welcome to KitchenLedger", HTML with restaurant name + quick-start link
    - `invitation`: subject "{inviter_name} invited you to {restaurant_name}", HTML with accept invite CTA button linking to `{WEB_URL}/invite/accept?token={payload.invite_token}`
    - `payment_overdue`: subject "Payment overdue — {vendor_name}", HTML with amount + due date + pay now link
    - `report_ready`: subject "Your {report_name} is ready", HTML with download button + expiry info
  - All emails sent FROM `noreply@kitchenledger.app` (configurable via `EMAIL_FROM` env var)
- [ ] **Test:** Send invitation email → Resend API called with correct to/subject/html. Accept invite link contains correct token.

---

## NOTIF-5: Notification API Endpoints

- [ ] `src/routes/notifications.routes.ts`:
  - `GET /api/notifications` — list for `X-User-Id` (from Gateway headers), paginated (default 20/page)
  - `PATCH /api/notifications/{id}/read` — mark single read; verify notification.user_id = requesting user
  - `PATCH /api/notifications/read-all` — mark all read for tenant + user
  - `GET /api/notifications/unread-count` — returns `{ count: number }` for badge
- [ ] `src/routes/devices.routes.ts`:
  - `POST /api/notifications/devices` — body: `{ token, platform }`; upsert device token for `X-User-Id`
  - `DELETE /api/notifications/devices/{token}` — deactivate token (call on logout)
- [ ] `POST /internal/notifications/send` — direct send from other services; INTERNAL_SERVICE_SECRET header required; body: `{ user_id, title, body, priority, channels, data }`
- [ ] **Test:** Register device → receive push notification via event → `GET /api/notifications` returns it → mark read → unread count = 0.

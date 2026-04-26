# Notification Service

Delivers alerts to restaurant staff and owners across push notifications, email, and WhatsApp. This service is purely reactive — it listens for events from other services and dispatches the right message to the right people. It also provides a notification inbox API so users can see past alerts in the app.

---

## Core Concepts

### Event-Driven Dispatch

The notification service subscribes to events published by other services over the message broker. When an event arrives, it determines which users should be notified, what channel to use, and what the message should say — then dispatches it.

| Event | Source Service | Notification Sent |
|---|---|---|
| `auth.password.reset.requested` | Auth | Password reset email to the user |
| `auth.tenant.created` | Auth | Welcome email to the new restaurant owner |
| `inventory.stock.low` | Inventory | Push alert to managers: item X is below reorder point |
| `inventory.receipt.confirmed` | Inventory | Push confirmation to the manager who raised the PO |
| `ai.ocr.completed` | AI | Push notification to the user who submitted the OCR job |
| `report.generated` | Report | Push + email to the user who requested the report, with download link |

### Channels

**Push notifications** — sent to mobile devices via Expo. Requires a device token registered for the user.

**Email** — sent via Resend. Used for longer-form messages (password resets, report delivery, daily summaries).

**WhatsApp** — used for teams that prefer WhatsApp over email for operational alerts. Configured per tenant.

### Notification Inbox

Every notification is stored in the database. Users can view their notification history in the app, mark individual notifications as read, or mark all as read at once.

---

## API

### Notification Inbox

| Method | Path | What It Does |
|---|---|---|
| `GET` | `/api/notifications` | Lists notifications for the current user, newest first. Supports `page` and `limit` query params. Returns notifications addressed specifically to this user plus broadcast notifications for their tenant. |
| `GET` | `/api/notifications/unread-count` | Returns the count of unread notifications — used to display the badge in the app. |
| `PATCH` | `/api/notifications/:id/read` | Marks a single notification as read. |
| `PATCH` | `/api/notifications/read-all` | Marks all of the current user's unread notifications as read. |

### Device Token Management

Device tokens are the push notification addresses for a user's mobile device. They must be registered when the user logs in on a new device and removed when they log out.

| Method | Path | What It Does |
|---|---|---|
| `POST` | `/api/notifications/devices` | Registers a push notification token for the current user's device. Accepts `{ token, platform }` where platform is `ios`, `android`, or `web`. If the token already exists (same device, re-logging in), the registration is updated. |
| `DELETE` | `/api/notifications/devices/:token` | Deactivates a device token. Call this on logout so the device no longer receives push notifications for the logged-out user. |

### Example: Listing Notifications

```http
GET /api/notifications?page=1&limit=20
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "type": "stock.low",
      "priority": "high",
      "title": "Low Stock Alert",
      "body": "Chicken breast is below the reorder point (3.2 kg remaining, reorder at 5 kg).",
      "data": { "item_id": "...", "current_quantity": 3.2, "unit": "kg" },
      "channels": ["push"],
      "read_at": null,
      "created_at": "2024-11-01T08:15:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 47 }
}
```

### Example: Registering a Device Token

```http
POST /api/notifications/devices
{
  "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "ios"
}
```

---

## Getting Started

```bash
cd services/notification-service
npm install
npm run dev
```

The service starts on port **8086**.

### Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `RABBITMQ_URL` | RabbitMQ connection string (subscribes to events from other services) |
| `RESEND_API_KEY` | API key for sending transactional email via Resend |
| `EXPO_ACCESS_TOKEN` | Token for sending push notifications via Expo |
| `INTERNAL_SERVICE_SECRET` | Shared secret for internal service-to-service calls |

---

## Health Check

```bash
curl http://localhost:8086/health
```

---

## Running Tests

```bash
npm run test
```

# EPIC-06: Notifications & Audit Logging — Deep Test Specification

> **Scope:** All 3 notification tiers (immediate/daily/weekly), device token management, delivery & deduplication, audit log completeness, immutability, tenant isolation, retention.
> **Services:** Notification Service (:8086), Gateway (:8080), All services (audit log producers)
> **Tables:** notifications, device_tokens, audit_logs
> **Base URL:** `http://localhost:8080`

---

## Table of Contents

1. [Immediate (Critical) Push Notifications](#1-immediate-critical-push-notifications)
2. [Notification Delivery & Device Tokens](#2-notification-delivery--device-tokens)
3. [Deduplication & Idempotency](#3-deduplication--idempotency)
4. [Daily Digest](#4-daily-digest)
5. [Weekly Summary](#5-weekly-summary)
6. [Notification Read/Unread State](#6-notification-readunread-state)
7. [Audit Log Completeness](#7-audit-log-completeness)
8. [Audit Log Immutability & Security](#8-audit-log-immutability--security)
9. [WhatsApp/SMS Integration](#9-whatsappsms-integration)

---

## 1. Immediate (Critical) Push Notifications

### TC-NOTIFY-01 — STOCK_LOW Alert Fires When Item Drops Below PAR

**Precondition:** Chicken Breast PAR = 10, stock = 15

**Action:**
```http
PATCH /api/inventory/items/<ITEM_ID_CHICKEN>
Authorization: Bearer <OWNER_TOKEN>
{ "currentStock": 8 }
```

**Expected (within 30 seconds):**
```sql
SELECT type, priority, message, read_at, created_at
FROM notifications
WHERE type = 'STOCK_LOW' AND tenant_id = '<TENANT_ID>'
ORDER BY created_at DESC LIMIT 1;
```

**Expected row:**
- `type = 'STOCK_LOW'`
- `priority = 'CRITICAL'`
- `message` contains "Chicken Breast" and mentions PAR level
- `read_at IS NULL` (unread)

---

### TC-NOTIFY-02 — STOCK_LOW: Owner AND Manager Both Receive

```sql
SELECT user_id FROM notifications
WHERE type = 'STOCK_LOW' AND tenant_id = '<TENANT_ID>'
  AND created_at > NOW() - INTERVAL '1 minute';
-- Should have 2 rows: one for owner, one for manager
```

---

### TC-NOTIFY-03 — STOCK_LOW: Kitchen Staff Does NOT Receive

```sql
SELECT user_id FROM notifications
WHERE type = 'STOCK_LOW' AND user_id = '<STAFF_USER_ID>'
  AND tenant_id = '<TENANT_ID>';
-- Should return 0 rows
```

---

### TC-NOTIFY-04 — STOCK_LOW: No Alert When PAR = 0 (Disabled)

**Setup:**
```http
PATCH /api/inventory/items/<ITEM_ID_TOMATO>
{ "parLevel": 0, "currentStock": 0 }
```

**Expected:** No `STOCK_LOW` notification for Tomato

```sql
SELECT COUNT(*) FROM notifications
WHERE type = 'STOCK_LOW' AND entity_id = '<ITEM_ID_TOMATO>'
  AND created_at > NOW() - INTERVAL '1 minute';
-- Expect: 0
```

---

### TC-NOTIFY-05 — EXPIRY_ALERT Fires 2 Days Before Expiry

**Create stock entry expiring in exactly 2 days:**
```http
POST /api/inventory/items/<ITEM_ID_CHICKEN>/stock-entries
{ "expiryDate": "<today + 2 days>", "quantity": 5, "batchNumber": "BATCH-ALERT" }
```

**Expected:**
```sql
SELECT type, priority, message FROM notifications
WHERE type = 'EXPIRY_ALERT' AND tenant_id = '<TENANT_ID>'
ORDER BY created_at DESC LIMIT 1;
-- message: "Chicken Breast (BATCH-ALERT): 5 kg expires in 2 days"
-- priority: CRITICAL
```

---

### TC-NOTIFY-06 — EXPIRY_ALERT: Does NOT Fire at 3 Days

**Create stock entry expiring in exactly 3 days (above 2-day threshold):**

**Expected:** No `EXPIRY_ALERT` notification (threshold default = 2 days)

---

### TC-NOTIFY-07 — EXPIRY_ALERT: Item Expires TODAY — Critical

```http
POST /api/inventory/items/<ITEM_ID_CHICKEN>/stock-entries
{ "expiryDate": "<today>", "quantity": 2 }
```

**Expected:** `EXPIRY_ALERT` with message "expires TODAY", `priority: CRITICAL`

---

### TC-NOTIFY-08 — EXPIRY_ALERT: Configurable Threshold

```http
PATCH /api/auth/tenant/settings
Authorization: Bearer <OWNER_TOKEN>
{ "expiryAlertDays": 3 }
```

**Create stock entry expiring in 3 days:**

**Expected:** Alert now fires at 3 days

---

### TC-NOTIFY-09 — NO_SHOW Alert After Grace Period

**Scenario:** Anita's shift starts at 09:00. Clock-in grace period = 15 minutes.

**At 09:15 + 1 minute (09:16): system runs no-show check:**

**Expected:**
```sql
SELECT type, priority, message FROM notifications
WHERE type = 'NO_SHOW' AND tenant_id = '<TENANT_ID>';
-- message: "Anita Patel has not clocked in for their 09:00 shift"
-- priority: CRITICAL
```

---

### TC-NOTIFY-10 — NO_SHOW: On-Time Clock-In Prevents Alert

**Anita clocks in at 09:14 (within grace period):**

**Expected:** No `NO_SHOW` notification created

---

### TC-NOTIFY-11 — CASH_DISCREPANCY Alert

**Precondition:** DSR submitted with cashOverShort = -200 (threshold ₹100)

**Expected:**
```sql
SELECT type, message, priority FROM notifications
WHERE type = 'CASH_DISCREPANCY' AND tenant_id = '<TENANT_ID>';
-- message: "Cash short ₹200 in yesterday's sales report — explanation required"
```

---

### TC-NOTIFY-12 — CASH_DISCREPANCY: Below Threshold, No Alert

**DSR with cashOverShort = -50 (below ₹100 threshold):**

**Expected:** No `CASH_DISCREPANCY` notification

---

### TC-NOTIFY-13 — OVERTIME_APPROACHING at 38 Hours

**Scenario:** Employee accumulates 38 hours this FLSA week

**Expected:**
```sql
SELECT type, message, priority FROM notifications
WHERE type = 'OVERTIME_APPROACHING' AND tenant_id = '<TENANT_ID>';
-- priority: IMPORTANT
-- message: "Ravi Kumar has worked 38 hours this week — approaching 40-hour overtime threshold"
```

---

### TC-NOTIFY-14 — PRICE_CHANGE Alert: >10% Invoice Price Increase

**After TC-INV-53 (invoice price 11.11% above PO):**

```sql
SELECT type, priority, message FROM notifications
WHERE type = 'PRICE_CHANGE_ALERT' AND tenant_id = '<TENANT_ID>';
-- priority: CRITICAL
-- message: "Chicken Breast price increased 11.11% above negotiated price on invoice METRO-2026-4521"
```

---

### TC-NOTIFY-15 — PRICE_CHANGE: No Alert at 9.9% Increase

**Invoice price 9.9% above PO → below 10% threshold:**

**Expected:** No `PRICE_CHANGE_ALERT` notification

---

### TC-NOTIFY-16 — CRITICAL_TASK_OVERDUE Alert 30 Minutes Before

**Create critical task with dueTime 30 minutes from now:**

**At exactly 30 minutes before deadline:**

```sql
SELECT type, priority, message FROM notifications
WHERE type = 'CRITICAL_TASK_OVERDUE' AND tenant_id = '<TENANT_ID>';
-- message: "Prep Station Sanitization Check is incomplete — due in 30 minutes"
-- priority: CRITICAL
```

---

### TC-NOTIFY-17 — THREE_WAY_MATCH Discrepancy Alert

**After TC-INV-51 (quantity short on delivery):**

```sql
SELECT type FROM notifications
WHERE type = 'THREE_WAY_MATCH_DISCREPANCY' AND tenant_id = '<TENANT_ID>';
-- Notification created linking to the PO
```

---

## 2. Notification Delivery & Device Tokens

### TC-NOTIFY-20 — Register Device Token

```http
POST /api/notifications/device-tokens
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "token": "ExponentPushToken[xxxxxxxxxxxxxxx]",
  "platform": "IOS",
  "deviceId": "device-uuid-001"
}
```

**Expected: `HTTP 201`**

**Database:**
```sql
SELECT user_id, token, platform, device_id, is_active
FROM device_tokens WHERE user_id = '<ownerId>' AND tenant_id = '<TENANT_ID>';
-- is_active = true
```

---

### TC-NOTIFY-21 — Same User, Two Devices — Both Receive Push

**Register second token (same user, Android):**
```http
POST /api/notifications/device-tokens

{
  "token": "ExponentPushToken[yyy]",
  "platform": "ANDROID",
  "deviceId": "device-uuid-002"
}
```

**Trigger a notification (e.g., STOCK_LOW):**

**Expected:** Both device tokens receive push (via Expo Push Service)

```sql
SELECT COUNT(*) FROM notification_deliveries
WHERE notification_id = '<notificationId>'
  AND user_id = '<ownerId>';
-- Count = 2 (one per device)
```

---

### TC-NOTIFY-22 — Logout Deregisters Token

```http
POST /api/auth/logout
Authorization: Bearer <OWNER_TOKEN>

{ "deviceToken": "ExponentPushToken[xxxxxxxxxxxxxxx]" }
```

**Expected:** Token marked inactive:
```sql
SELECT is_active FROM device_tokens
WHERE token = 'ExponentPushToken[xxxxxxxxxxxxxxx]';
-- is_active = false
```

---

### TC-NOTIFY-23 — Stale/Invalid Token Removed After Push Failure

**Scenario:** Push delivery fails with "DeviceNotRegistered" from Expo

**Expected:** Token automatically deactivated in DB, retry not attempted

```sql
SELECT is_active FROM device_tokens
WHERE token = '<invalid_expo_token>';
-- is_active = false after failed delivery
```

---

### TC-NOTIFY-24 — Delivery Status Tracking

```sql
SELECT notification_id, status, attempted_at, delivered_at, error
FROM notification_deliveries
WHERE tenant_id = '<TENANT_ID>'
ORDER BY attempted_at DESC LIMIT 5;
-- status should be: DELIVERED, FAILED, or PENDING
```

---

### TC-NOTIFY-25 — Failed Delivery Retry (3 Attempts, Exponential Backoff)

**Simulate: First delivery fails (Expo service temporarily down)**

**Expected:**
- Retry 1: After 30 seconds
- Retry 2: After 60 seconds
- Retry 3: After 120 seconds
- After 3 failures: `status = 'FAILED'`, no more retries

```sql
SELECT COUNT(*) FROM notification_delivery_attempts
WHERE notification_delivery_id = '<deliveryId>';
-- Count = 3 (3 attempts made)
```

---

### TC-NOTIFY-26 — Critical Notifications: Push + Email (Both Channels)

**After a CASH_DISCREPANCY critical notification:**

```sql
SELECT channel FROM notification_deliveries
WHERE notification_id = '<notificationId>';
-- Should have 2 rows: 'PUSH' and 'EMAIL'
```

---

## 3. Deduplication & Idempotency

### TC-NOTIFY-30 — Same Event Twice in 1 Minute — Send Only Once

**Setup:** Trigger STOCK_LOW twice in rapid succession (set stock to 8, then to 7):

```sql
SELECT COUNT(*) FROM notifications
WHERE type = 'STOCK_LOW' AND entity_id = '<ITEM_ID_CHICKEN>'
  AND created_at > NOW() - INTERVAL '2 minutes';
-- Expect: 1 (deduplicated — same item, same event type, within dedup window)
```

---

### TC-NOTIFY-31 — Same Event Next Day — Not Deduplicated

**Scenario:** Stock-low notification sent Monday. Stock falls below PAR again Tuesday.

**Expected:** Two separate notifications (deduplication window expired)

---

### TC-NOTIFY-32 — Item Restocked Then Falls Below PAR Again — Alert Resets

```http
PATCH /api/inventory/items/<ITEM_ID_CHICKEN>
{ "currentStock": 15 }  // restocked above PAR
```

```http
PATCH /api/inventory/items/<ITEM_ID_CHICKEN>
{ "currentStock": 8 }   // falls below PAR again
```

**Expected:** Second `STOCK_LOW` alert fires (not deduplicated — stock was resolved in between)

---

## 4. Daily Digest

> **[PARTIAL — DIGEST GENERATION LOGIC UNCLEAR]**  
> The notification-service has an event consumer and dispatcher wired up, but the digest generation logic (aggregating multiple events into a single daily digest document and scheduling it for 07:00 IST) was not confirmed in the audit. The `GET /api/notifications/digest` endpoint may return 404 or an empty response.  
> **What to implement:** A scheduled job (cron at 07:00 tenant timezone) in notification-service that: queries pending-notification events for the tenant, groups them by category (vendorPayments, scheduleGaps, certifications, inventoryVariances, pendingPOs), builds the digest response object, persists it, and delivers via push + email. Endpoint: `GET /api/notifications/digest?date=YYYY-MM-DD`.

---

### TC-NOTIFY-40 — Daily Digest Contains All Sections

```http
GET /api/notifications/digest?date=2026-05-04
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:**
```json
{
  "digestDate": "2026-05-04",
  "generatedAt": "<timestamp>",
  "vendorPaymentsDue": [
    {
      "vendorName": "Metro Cash & Carry",
      "invoiceNumber": "METRO-2026-4521",
      "amount": 6440.00,
      "dueDate": "2026-06-05",
      "daysUntilDue": 32
    }
  ],
  "pendingPoApprovals": 0,
  "scheduleGaps": [],
  "unresolvedInventoryVariances": 0,
  "expiringCertifications": [
    {
      "employeeName": "Anita Patel",
      "certificationType": "FOOD_HANDLER",
      "expiresOn": "2026-12-31",
      "daysUntilExpiry": 241
    }
  ]
}
```

---

### TC-NOTIFY-41 — Vendor Payments: Only Due Within 7 Days Included

**Setup:**
- Invoice due in 5 days → appears in digest
- Invoice due in 8 days → does NOT appear in digest
- Invoice due in 0 days (today) → appears with "DUE TODAY" urgency
- Invoice overdue (due yesterday) → appears with "OVERDUE" flag

---

### TC-NOTIFY-42 — Schedule Gaps in Digest

**Setup:** Create schedule with a shift for Saturday that has no one assigned (open shift)

**Expected:** `scheduleGaps: [{ "date": "2026-05-09", "role": "KITCHEN_STAFF", "shiftTime": "09:00-17:00" }]`

---

### TC-NOTIFY-43 — Empty Digest When Nothing Due

**Setup:** All invoices paid, no certifications expiring, no schedule gaps

```http
GET /api/notifications/digest?date=2026-05-04
```

**Expected:**
```json
{
  "vendorPaymentsDue": [],
  "pendingPoApprovals": 0,
  "scheduleGaps": [],
  "unresolvedInventoryVariances": 0,
  "expiringCertifications": [],
  "summary": "All clear — no urgent items today"
}
```

---

### TC-NOTIFY-44 — Digest Sent at Correct Restaurant Timezone

**Restaurant timezone:** Asia/Kolkata (IST = UTC+5:30)

**Digest should send at 07:00 IST** (= 01:30 UTC)

**Verification:** Check scheduled digest delivery time matches restaurant timezone

---

### TC-NOTIFY-45 — Manager Cannot Access Financial Digest Content

**Manager receives digest but P&L details omitted:**
```http
GET /api/notifications/digest?date=2026-05-04
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected:** `vendorPaymentsDue` not present in manager response (finance-only content filtered by role)

---

## 5. Weekly Summary

> **[PARTIAL — SAME AS DAILY DIGEST]**  
> Weekly summary generation is also dependent on the digest scheduling logic. Endpoint `GET /api/notifications/weekly-summary` may not be implemented. Test it; if 404, treat as the same gap as the daily digest (G-NOTIFY-01 below).

### TC-NOTIFY-50 — Weekly Summary Contains All Sections

```http
GET /api/notifications/weekly-summary?weekOf=2026-05-04
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:**
```json
{
  "weekOf": "2026-W19",
  "pnlOverview": {
    "netSales": 138000.00,
    "foodCostPercent": 30.00,
    "laborCostPercent": 27.00,
    "netProfitMargin": 5.00
  },
  "topMenuItems": [
    { "name": "Masala Dosa", "grossProfit": 15000.00, "popularity": "HIGH" }
  ],
  "bottomMenuItems": [
    { "name": "Rava Idli", "grossProfit": 800.00, "popularity": "LOW" }
  ],
  "wasteTrend": {
    "thisWeek": 80.00,
    "lastWeek": 120.00,
    "trend": "IMPROVING",
    "percentChange": -33.3
  },
  "laborEfficiency": {
    "weeklyAvgSplh": 958.33,
    "trend": "STABLE",
    "bestDay": "FRIDAY",
    "worstDay": "MONDAY"
  }
}
```

---

### TC-NOTIFY-51 — Weekly Summary Covers Correct Date Range

**weekOf = 2026-05-04 (Monday):**
Should cover Mon 2026-05-04 through Sun 2026-05-10

**Verify:** All DSRs in that range included; Mon 2026-05-11 data NOT included

---

## 6. Notification Read/Unread State

### TC-NOTIFY-60 — List All Notifications with Unread Count

```http
GET /api/notifications
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:**
```json
{
  "notifications": [...],
  "unreadCount": 5,
  "totalCount": 12,
  "page": 1,
  "limit": 20
}
```

---

### TC-NOTIFY-61 — Filter Unread Only

```http
GET /api/notifications?read=false
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** Only notifications with `read_at IS NULL`

---

### TC-NOTIFY-62 — Filter by Priority

```http
GET /api/notifications?priority=CRITICAL
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** Only CRITICAL priority notifications

---

### TC-NOTIFY-63 — Mark Single Notification as Read

```http
POST /api/notifications/<notificationId>/read
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`**

```sql
SELECT read_at FROM notifications WHERE id = '<notificationId>';
-- read_at IS NOT NULL
```

**Unread count decrements by 1 in subsequent GET /notifications**

---

### TC-NOTIFY-64 — Mark All as Read

```http
POST /api/notifications/read-all
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`**

```sql
SELECT COUNT(*) FROM notifications
WHERE user_id = '<ownerId>' AND read_at IS NULL AND tenant_id = '<TENANT_ID>';
-- Count = 0
```

---

### TC-NOTIFY-65 — Notification Pagination

```http
GET /api/notifications?page=1&limit=5
GET /api/notifications?page=2&limit=5
GET /api/notifications?page=999&limit=5
```

**Expected:** Last page returns empty array, not error

---

---

## 7. Audit Log Completeness

For each operation, verify the audit log entry exists with correct fields.

### TC-AUDIT-01 — Login Success Audited

**After TC-AUTH-11:**
```sql
SELECT event_type, user_id, ip_address, timestamp, tenant_id
FROM audit_logs
WHERE event_type = 'LOGIN_SUCCESS' AND user_id = '<priyaUserId>'
ORDER BY timestamp DESC LIMIT 1;
-- ip_address NOT NULL
-- timestamp recent
-- tenant_id = '<TENANT_ID>'
```

---

### TC-AUDIT-02 — Login Failure Audited

**After TC-AUTH-12:**
```sql
SELECT event_type, email_attempted, ip_address
FROM audit_logs
WHERE event_type = 'LOGIN_FAILURE'
ORDER BY timestamp DESC LIMIT 1;
-- email_attempted = 'priya@dosapalace.com'
-- ip_address NOT NULL
```

---

### TC-AUDIT-03 — Inventory Item Created

```sql
SELECT event_type, entity_type, entity_id, old_value, new_value, user_id
FROM audit_logs
WHERE event_type = 'INVENTORY_ITEM_CREATED' AND tenant_id = '<TENANT_ID>';
-- old_value IS NULL (nothing before creation)
-- new_value contains item snapshot (JSON with name, category, abc_category)
-- user_id = owner who created it
```

---

### TC-AUDIT-04 — Inventory Item Updated

After updating Chicken Breast PAR level:
```sql
SELECT old_value, new_value FROM audit_logs
WHERE event_type = 'INVENTORY_ITEM_UPDATED' AND entity_id = '<ITEM_ID_CHICKEN>'
ORDER BY timestamp DESC LIMIT 1;
-- old_value: {"parLevel": 10}
-- new_value: {"parLevel": 12}
```

---

### TC-AUDIT-05 — Waste Log Created

```sql
SELECT event_type, entity_type FROM audit_logs
WHERE event_type = 'WASTE_LOG_CREATED' AND tenant_id = '<TENANT_ID>';
-- entity_type = 'waste_log'
```

---

### TC-AUDIT-06 — PO Created

```sql
SELECT event_type, entity_id FROM audit_logs
WHERE event_type = 'PO_CREATED' AND entity_id = '<PO_ID>';
-- new_value contains PO snapshot
```

---

### TC-AUDIT-07 — PO Price Discrepancy (Three-Way Match)

```sql
SELECT event_type, new_value FROM audit_logs
WHERE event_type = 'PRICE_CHANGE_DETECTED' AND entity_id = '<PO_ID>';
-- new_value contains: old_price, new_price, change_percent
```

---

### TC-AUDIT-08 — DSR Created

```sql
SELECT event_type, entity_id FROM audit_logs
WHERE event_type = 'DSR_CREATED' AND tenant_id = '<TENANT_ID>';
```

---

### TC-AUDIT-09 — Expense Approved

```sql
SELECT event_type, entity_id, user_id, new_value FROM audit_logs
WHERE event_type = 'EXPENSE_APPROVED';
-- user_id = owner who approved
-- new_value: {"status": "APPROVED", "approvedAt": "..."}
```

---

### TC-AUDIT-10 — Clock-In Edited by Manager

```sql
SELECT old_value, new_value, performed_by FROM audit_logs
WHERE event_type = 'CLOCK_IN_EDITED';
-- old_value: {"clockIn": "09:00"}
-- new_value: {"clockIn": "09:05"}
-- performed_by = <managerId>
```

---

### TC-AUDIT-11 — Schedule Published

```sql
SELECT event_type, new_value FROM audit_logs
WHERE event_type = 'SCHEDULE_PUBLISHED' AND tenant_id = '<TENANT_ID>';
-- new_value: {"weekStartDate": "2026-05-04", "shiftsCount": 2, "publishedBy": "<managerId>"}
```

---

### TC-AUDIT-12 — Schedule Changed After Publication

```sql
SELECT event_type, old_value, new_value FROM audit_logs
WHERE event_type = 'SHIFT_MODIFIED_POST_PUBLISH';
-- old_value: original shift times
-- new_value: updated shift times
-- user_id = who made the change
```

---

### TC-AUDIT-13 — Tip Adjustment Audited

```sql
SELECT event_type, old_value, new_value, performed_by FROM audit_logs
WHERE event_type = 'TIP_ADJUSTED';
-- old_value: {"amount": 440.00}
-- new_value: {"amount": 500.00, "reason": "..."}
```

---

### TC-AUDIT-14 — Role Change Audited

```sql
SELECT old_value, new_value, performed_by FROM audit_logs
WHERE event_type = 'ROLE_CHANGED' AND entity_id = '<raviUserId>';
-- old_value: {"role": "MANAGER"}
-- new_value: {"role": "KITCHEN_STAFF"}
```

---

### TC-AUDIT-15 — Data Export Audited

```http
GET /api/finance/reports/pnl/export?format=csv&period=monthly&month=2026-05
Authorization: Bearer <OWNER_TOKEN>
```

```sql
SELECT event_type, new_value FROM audit_logs
WHERE event_type = 'DATA_EXPORTED' AND tenant_id = '<TENANT_ID>'
ORDER BY timestamp DESC LIMIT 1;
-- new_value: {"exportType": "PNL_CSV", "exportedBy": "<ownerId>", "recordCount": 31}
```

---

### TC-AUDIT-16 — Void Transaction Audited

```sql
SELECT event_type, new_value FROM audit_logs
WHERE event_type = 'TRANSACTION_VOIDED';
-- new_value: {"transactionId": "...", "voidReason": "...", "authorizedBy": "<managerId>"}
```

---

### TC-AUDIT-17 — Pay Rate Change Audited

```http
PATCH /api/staff/employees/<EMPLOYEE_ID_ANITA>
{ "hourlyRate": 200.00 }
```

```sql
SELECT old_value, new_value FROM audit_logs
WHERE event_type = 'PAY_RATE_CHANGED' AND entity_id = '<EMPLOYEE_ID_ANITA>';
-- old_value: {"hourlyRate": 180.00}
-- new_value: {"hourlyRate": 200.00}
```

---

### TC-AUDIT-18 — No Sensitive Data in Audit Logs

```sql
SELECT new_value, old_value FROM audit_logs
WHERE tenant_id = '<TENANT_ID>';
```

**Verify NONE of these appear in any audit log values:**
- Passwords or password hashes
- JWT tokens
- Credit card numbers
- Bank account numbers
- SSN/government IDs
- Database connection strings

---

## 8. Audit Log Immutability & Security

### TC-AUDIT-20 — Cannot DELETE Audit Log via API

```http
DELETE /api/audit-logs/<auditLogId>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 405`** — Method Not Allowed

---

### TC-AUDIT-21 — Cannot UPDATE Audit Log via API

```http
PUT /api/audit-logs/<auditLogId>
Authorization: Bearer <OWNER_TOKEN>
{ "eventType": "MODIFIED" }
```

**Expected: `HTTP 405`**

```http
PATCH /api/audit-logs/<auditLogId>
{ "timestamp": "2020-01-01" }
```

**Expected: `HTTP 405`**

---

### TC-AUDIT-22 — Database-Level: App User Cannot Delete Audit Logs

```sql
-- Connect as application database user (not superuser)
DELETE FROM audit_logs WHERE id = '<auditLogId>';
-- Expected: ERROR: permission denied for table audit_logs
```

---

### TC-AUDIT-23 — Audit Log Count Only Grows

```sql
SELECT COUNT(*) AS before_count FROM audit_logs WHERE tenant_id = '<TENANT_ID>';
```

Perform 5 operations (create 5 items):

```sql
SELECT COUNT(*) AS after_count FROM audit_logs WHERE tenant_id = '<TENANT_ID>';
-- after_count >= before_count + 5 (count only increased, never decreased)
```

---

### TC-AUDIT-24 — Audit Logs Are Tenant-Scoped

```http
GET /api/audit-logs
Authorization: Bearer <TENANT_B_TOKEN>
```

**Expected:** Returns ONLY Biryani Hub's audit logs. Dosa Palace events absent.

```sql
-- Direct database check (with TENANT_A context)
SET app.current_tenant_id = '<TENANT_A_ID>';
SELECT COUNT(*) FROM audit_logs WHERE tenant_id = '<TENANT_B_ID>';
-- Count = 0 (RLS blocks cross-tenant access)
```

---

### TC-AUDIT-25 — Audit Log Filtering by Event Type

```http
GET /api/audit-logs?eventType=INVENTORY_ITEM_CREATED
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** Only inventory creation events

---

### TC-AUDIT-26 — Audit Log Filtering by Date Range

```http
GET /api/audit-logs?dateFrom=2026-05-01&dateTo=2026-05-04
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** Only logs from that date range

---

### TC-AUDIT-27 — Audit Log Pagination

```http
GET /api/audit-logs?page=1&limit=20
GET /api/audit-logs?page=2&limit=20
```

**Expected:** Pagination works; page 999 returns empty array

---

### TC-AUDIT-28 — System Events Have system userId

For events not triggered by a human (e.g., automated stock-low alert creating a notification):
```sql
SELECT user_id FROM audit_logs
WHERE event_type = 'NOTIFICATION_CREATED' AND tenant_id = '<TENANT_ID>';
-- user_id = 'SYSTEM' or a designated system UUID (not null)
```

---

### TC-AUDIT-29 — All Timestamps in UTC

```sql
SELECT timestamp, timezone(timestamp) FROM audit_logs
WHERE tenant_id = '<TENANT_ID>' LIMIT 5;
-- All timestamps stored in UTC (TIMESTAMPTZ)
-- When restaurant is Asia/Kolkata (UTC+5:30), timestamps still in UTC
```

---

## 9. WhatsApp/SMS Integration

> **[GAP — NOT IMPLEMENTED]**  
> The notification-service currently has only two delivery providers: Expo push notifications and Resend email. There is no Twilio, WhatsApp Business API, or SMS provider integrated.  
> All TC-NOTIFY-70 through TC-NOTIFY-73 will fail with `HTTP 422` or `400` (unknown channel) or `HTTP 501`.  
> **Do not run these tests until the WhatsApp/SMS provider is integrated.**  
> **What to implement:** Integrate Twilio (or equivalent) for SMS + WhatsApp Business API. Add a `WHATSAPP` and `SMS` delivery channel to the notification-service dispatcher. Store `supplier.whatsappNumber` and `employee.phoneNumber`. Implement fallback chain: WhatsApp → Email on delivery failure.

---

### TC-NOTIFY-70 — PO Sent via WhatsApp to Supplier

> **[GAP — NOT IMPLEMENTED]** Returns 422/400/501 until WhatsApp provider is integrated.

```http
POST /api/inventory/purchase-orders/<PO_ID>/send
Authorization: Bearer <OWNER_TOKEN>

{
  "channel": "WHATSAPP"
}
```

**Expected after implementation: `HTTP 200`**

**Message content verification (check WhatsApp template):**
- PO number, supplier name, item list with quantities and prices
- Expected delivery date, restaurant contact details

---

### TC-NOTIFY-71 — WhatsApp Delivery Failure → Email Fallback

> **[GAP — NOT IMPLEMENTED]**

**Scenario:** Supplier WhatsApp number is invalid or delivery fails

**Expected after implementation:** System falls back to email delivery

```sql
SELECT delivery_channel, fallback_used FROM notification_deliveries
WHERE notification_type = 'PO_SENT' AND po_id = '<PO_ID>';
-- delivery_channel = 'EMAIL', fallback_used = true
```

---

### TC-NOTIFY-72 — Schedule Published → SMS to Staff Without App

> **[GAP — NOT IMPLEMENTED]**

**For employees with `appInstalled = false`:**

```http
POST /api/staff/shifts/publish?weekStartDate=2026-05-04
```

**Expected after implementation:** SMS sent to employees who haven't installed the app, with shift details

---

### TC-NOTIFY-73 — Supplier Without WhatsApp Number → Email Only

> **[GAP — NOT IMPLEMENTED]**

**Supplier with no whatsapp field:**
```http
POST /api/inventory/purchase-orders/<PO_ID>/send
```

**Expected after implementation:** Email delivery only, no WhatsApp attempted

---

## GO/NO-GO Checklist — Notifications & Audit Epic

| Test | Required | Status |
|---|---|---|
| TC-NOTIFY-01 STOCK_LOW fires correctly | MANDATORY | ✅ Implemented |
| TC-NOTIFY-03 Kitchen staff not notified | MANDATORY | ✅ Implemented |
| TC-NOTIFY-05 Expiry alert at 2 days | MANDATORY | ✅ Implemented |
| TC-NOTIFY-09 No-show alert | MANDATORY | ✅ Implemented |
| TC-NOTIFY-11 Cash discrepancy alert | MANDATORY | ✅ Implemented |
| TC-NOTIFY-14 Price change >10% alert | MANDATORY | ✅ Implemented |
| TC-NOTIFY-16 Critical task 30-min alert | MANDATORY | ✅ Implemented |
| TC-NOTIFY-30 Deduplication within window | MANDATORY | ✅ Implemented |
| TC-NOTIFY-40 Daily digest all sections | MANDATORY | ⚠️ PARTIAL — digest generation may not be built |
| TC-NOTIFY-50 Weekly summary | RECOMMENDED | ⚠️ PARTIAL — same gap as digest |
| TC-NOTIFY-60 Unread count accurate | MANDATORY | ✅ Implemented |
| TC-NOTIFY-70–73 WhatsApp/SMS | MANDATORY | ❌ GAP — not implemented |
| TC-AUDIT-01 through TC-AUDIT-17 ALL events logged | MANDATORY | ✅ Implemented |

### Gaps to Implement (Notifications Epic)

| # | Feature | What to Build | Effort |
|---|---|---|---|
| G-NOTIFY-01 | **Daily digest generation + scheduling** | Cron job at 07:00 tenant timezone: aggregate pending notification events per tenant → build digest document (vendorPayments ≤7 days, scheduleGaps, certifications expiring, inventory variances) → persist → deliver via push + email. Expose `GET /api/notifications/digest?date=`. | Medium |
| G-NOTIFY-02 | **Weekly summary generation** | Similar to daily digest but weekly scope: P&L overview, top/bottom menu items, waste trend, labor efficiency trend. Expose `GET /api/notifications/weekly-summary?weekOf=`. | Medium (depends on G-NOTIFY-01 pattern) |
| G-NOTIFY-03 | **WhatsApp/SMS provider** | Integrate Twilio (or equivalent). Add `WHATSAPP` + `SMS` delivery channels to dispatcher. Store `supplier.whatsappNumber` + `employee.phoneNumber`. Implement WhatsApp → Email fallback on delivery failure. Add `appInstalled` flag to employee; send SMS on schedule publish if false. | Large |
| TC-AUDIT-18 No sensitive data in logs | MANDATORY |
| TC-AUDIT-20 DELETE blocked | MANDATORY |
| TC-AUDIT-22 DB-level delete blocked | MANDATORY |
| TC-AUDIT-24 Tenant isolation | MANDATORY |

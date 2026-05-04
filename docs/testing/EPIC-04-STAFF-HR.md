# EPIC-04: Staff & HR — Deep Test Specification

> **Scope:** Employee management, shift scheduling, clock in/out with geofencing, break compliance, overtime, task management with photo verification, shift feedback, tip pool calculation, performance goals, certification tracking.
> **Services:** Staff Service (:8088), Gateway (:8080), Notification Service (:8086)
> **Tables:** employees, shifts, tasks, shift_feedback, tip_pools, performance_goals, attendance, certifications
> **Base URL:** `http://localhost:8080`

---

## Table of Contents

1. [Employee Management](#1-employee-management)
2. [Shift Scheduling](#2-shift-scheduling)
3. [Attendance — Clock In/Out & Geofencing](#3-attendance--clock-inout--geofencing)
4. [Break Tracking & Overtime](#4-break-tracking--overtime)
5. [Task Management with Photo Verification](#5-task-management-with-photo-verification)
6. [Shift Feedback](#6-shift-feedback)
7. [Tip Pool Calculation](#7-tip-pool-calculation)
8. [Performance Goals](#8-performance-goals)
9. [Certification Management](#9-certification-management)
10. [RBAC Enforcement for Staff Module](#10-rbac-enforcement-for-staff-module)

---

## Test Variables

```
OWNER_TOKEN         = from Epic 1
MANAGER_TOKEN       = from Epic 1
STAFF_TOKEN         = from Epic 1
TENANT_ID           = from Epic 1
EMPLOYEE_ID_RAVI    = set in TC-HR-01
EMPLOYEE_ID_ANITA   = set in TC-HR-02
SHIFT_ID_RAVI       = set in TC-HR-20
SHIFT_ID_ANITA      = set in TC-HR-20
TASK_ID             = set in TC-HR-40
ATTENDANCE_ID       = set in TC-HR-30
```

---

## 1. Employee Management

### TC-HR-01 — Create Manager Employee Record (Full Fields)

```http
POST /api/staff/employees
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "name": "Ravi Kumar",
  "role": "MANAGER",
  "email": "ravi@dosapalace.com",
  "phone": "+91-9123456789",
  "hireDate": "2025-01-15",
  "status": "ACTIVE",
  "hourlyRate": 250.00,
  "availability": {
    "monday": true,
    "tuesday": true,
    "wednesday": true,
    "thursday": true,
    "friday": true,
    "saturday": true,
    "sunday": false
  },
  "certifications": [
    { "type": "FOOD_HANDLER", "issuedDate": "2025-01-10", "expiryDate": "2027-01-10" },
    { "type": "FIRST_AID", "issuedDate": "2025-02-01", "expiryDate": "2026-02-01" }
  ],
  "emergencyContact": {
    "name": "Kavya Kumar",
    "phone": "+91-9876543210",
    "relationship": "SPOUSE"
  }
}
```

**Expected: `HTTP 201`**
```json
{
  "id": "<uuid>",
  "name": "Ravi Kumar",
  "role": "MANAGER",
  "status": "ACTIVE",
  "hourlyRate": 250.00,
  "tenantId": "<TENANT_ID>",
  "deletedAt": null
}
```

**Save:** `EMPLOYEE_ID_RAVI`

**Database:**
```sql
SELECT name, role, hourly_rate, status, tenant_id, deleted_at
FROM employees WHERE id = '<EMPLOYEE_ID_RAVI>';
-- hourly_rate stored as NUMERIC, not float
-- deleted_at IS NULL
```

---

### TC-HR-02 — Create Kitchen Staff Employee (Minimal Fields)

```http
POST /api/staff/employees
Authorization: Bearer <OWNER_TOKEN>

{
  "name": "Anita Patel",
  "role": "KITCHEN_STAFF",
  "email": "anita@dosapalace.com",
  "phone": "+91-9012345678",
  "hireDate": "2025-03-01",
  "hourlyRate": 180.00,
  "certifications": [
    { "type": "FOOD_HANDLER", "expiryDate": "2026-12-31" }
  ]
}
```

**Expected: `HTTP 201`** — Save: `EMPLOYEE_ID_ANITA`

---

### TC-HR-03 — Duplicate Email Within Tenant

```http
POST /api/staff/employees

{
  "name": "Duplicate Ravi",
  "email": "ravi@dosapalace.com",
  "role": "KITCHEN_STAFF"
}
```

**Expected: `HTTP 409`**
```json
{ "error": "EMAIL_ALREADY_EXISTS", "message": "An employee with this email already exists" }
```

---

### TC-HR-04 — Employee with Hourly Rate Zero (Volunteer/Salaried)

```http
POST /api/staff/employees

{
  "name": "Family Helper",
  "role": "KITCHEN_STAFF",
  "hourlyRate": 0.00
}
```

**Expected: `HTTP 201`** — Zero rate is valid (unpaid/family)

---

### TC-HR-05 — Employee with Negative Hourly Rate

```http
POST /api/staff/employees

{
  "name": "Test",
  "hourlyRate": -100.00
}
```

**Expected: `HTTP 400`** — negative rate invalid

---

### TC-HR-06 — Soft Delete Employee — Historical Records Preserved

```http
DELETE /api/staff/employees/<EMPLOYEE_ID_ANITA>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`**

**Database:**
```sql
SELECT name, deleted_at FROM employees WHERE id = '<EMPLOYEE_ID_ANITA>';
-- deleted_at IS NOT NULL (soft deleted, row preserved)
```

**Historical attendance records still exist:**
```sql
SELECT COUNT(*) FROM attendance WHERE employee_id = '<EMPLOYEE_ID_ANITA>';
-- Count > 0 (history preserved)
```

---

### TC-HR-07 — Get All Employees (Owner Sees All)

```http
GET /api/staff/employees
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** All active employees for tenant

---

### TC-HR-08 — Kitchen Staff Sees Only Own Profile

```http
GET /api/staff/employees/<EMPLOYEE_ID_RAVI>
Authorization: Bearer <STAFF_TOKEN>
```

**Expected: `HTTP 403`**

```http
GET /api/staff/employees/<EMPLOYEE_ID_ANITA>
Authorization: Bearer <STAFF_TOKEN>
```

**Expected: `HTTP 200`** — own profile accessible

---

### TC-HR-09 — Update Employee Availability

```http
PATCH /api/staff/employees/<EMPLOYEE_ID_RAVI>
Authorization: Bearer <OWNER_TOKEN>

{
  "availability": {
    "monday": true,
    "sunday": true,
    "saturday": false
  }
}
```

**Expected: `HTTP 200`** — availability updated

---

### TC-HR-10 — Employee with All Days Unavailable

```http
PATCH /api/staff/employees/<EMPLOYEE_ID_ANITA>

{
  "availability": {
    "monday": false, "tuesday": false, "wednesday": false,
    "thursday": false, "friday": false, "saturday": false, "sunday": false
  }
}
```

**Expected: `HTTP 200`** — valid (employee on extended leave)

**Side effect:** Attempting to schedule Anita should generate warning

---

## 2. Shift Scheduling

### TC-HR-20 — Create Batch Schedule for Week

```http
POST /api/staff/shifts/batch
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "weekStartDate": "2026-05-04",
  "shifts": [
    {
      "employeeId": "<EMPLOYEE_ID_RAVI>",
      "date": "2026-05-04",
      "startTime": "10:00",
      "endTime": "22:00",
      "role": "MANAGER",
      "station": "FLOOR"
    },
    {
      "employeeId": "<EMPLOYEE_ID_ANITA>",
      "date": "2026-05-04",
      "startTime": "09:00",
      "endTime": "17:00",
      "role": "KITCHEN_STAFF",
      "station": "HOT_LINE"
    }
  ]
}
```

**Expected: `HTTP 201`**
```json
{
  "shiftsCreated": 2,
  "weeklyLaborCostEstimate": {
    "ravi": { "hours": 12, "cost": 3000.00 },
    "anita": { "hours": 8, "cost": 1440.00 },
    "total": 4440.00
  },
  "publishStatus": "DRAFT"
}
```

**Save:** `SHIFT_ID_RAVI`, `SHIFT_ID_ANITA`

---

### TC-HR-21 — Publish Schedule

```http
POST /api/staff/shifts/publish?weekStartDate=2026-05-04
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected: `HTTP 200`** — All published shifts → employees receive push notifications

**Verification:**
```sql
SELECT COUNT(*) FROM notifications
WHERE type = 'SCHEDULE_PUBLISHED' AND tenant_id = '<TENANT_ID>'
  AND created_at > NOW() - INTERVAL '1 minute';
-- Count = 2 (one per employee)
```

---

### TC-HR-22 — Employee Views Own Schedule (Mobile)

```http
GET /api/staff/shifts/my-schedule?weekStartDate=2026-05-04
Authorization: Bearer <STAFF_TOKEN>
```

**Expected: `HTTP 200`**
```json
{
  "employee": { "id": "<EMPLOYEE_ID_ANITA>", "name": "Anita Patel" },
  "weekStartDate": "2026-05-04",
  "shifts": [
    {
      "date": "2026-05-04",
      "startTime": "09:00",
      "endTime": "17:00",
      "station": "HOT_LINE",
      "status": "SCHEDULED"
    }
  ]
}
```

---

### TC-HR-23 — Overlapping Shifts for Same Employee — Blocked

```http
POST /api/staff/shifts/batch

{
  "shifts": [
    {
      "employeeId": "<EMPLOYEE_ID_ANITA>",
      "date": "2026-05-04",
      "startTime": "12:00",
      "endTime": "20:00"
    }
  ]
}
```

(Anita already has 09:00–17:00 on this date — overlaps 12:00–17:00)

**Expected: `HTTP 422`**
```json
{
  "error": "SHIFT_OVERLAP",
  "message": "Anita Patel already has a shift from 09:00–17:00 on 2026-05-04"
}
```

---

### TC-HR-24 — Clopen Detection (Close at 23:00, Open at 07:00 Next Day)

```http
POST /api/staff/shifts/batch

{
  "shifts": [
    {
      "employeeId": "<EMPLOYEE_ID_RAVI>",
      "date": "2026-05-04",
      "startTime": "13:00",
      "endTime": "23:00"
    },
    {
      "employeeId": "<EMPLOYEE_ID_RAVI>",
      "date": "2026-05-05",
      "startTime": "07:00",
      "endTime": "15:00"
    }
  ]
}
```

Gap = 8 hours (< 10 hours threshold)

**Expected: `HTTP 422`** or `HTTP 201` with `warning: "CLOPEN detected: Ravi has only 8 hours between closing Monday and opening Tuesday"`

---

### TC-HR-25 — Shift with Start After End Time

```http
POST /api/staff/shifts/batch

{
  "shifts": [{
    "employeeId": "<EMPLOYEE_ID_ANITA>",
    "date": "2026-05-05",
    "startTime": "22:00",
    "endTime": "10:00"
  }]
}
```

(Night shift crossing midnight — valid case)

**Expected:** Either `HTTP 201` (crosses midnight, total = 12 hours) or `HTTP 400` if system doesn't support midnight-crossing shifts (document behavior)

---

### TC-HR-26 — Assign Shift to Deactivated Employee

```http
POST /api/staff/shifts/batch

{
  "shifts": [{
    "employeeId": "<EMPLOYEE_ID_ANITA>",
    "date": "2026-05-10"
  }]
}
```

(Anita was soft-deleted in TC-HR-06)

**Expected: `HTTP 422`**
```json
{ "error": "EMPLOYEE_INACTIVE", "message": "Cannot schedule an inactive employee" }
```

---

### TC-HR-27 — Shift Swap Request

**Anita requests swap with Ravi:**
```http
POST /api/staff/shifts/<SHIFT_ID_ANITA>/swap-request
Authorization: Bearer <STAFF_TOKEN>

{
  "requestedEmployeeId": "<EMPLOYEE_ID_RAVI>",
  "reason": "Family function"
}
```

**Expected: `HTTP 201`** — swap request created, Ravi notified

**Manager approves:**
```http
POST /api/staff/shifts/<SHIFT_ID_ANITA>/swap-request/<swapRequestId>/approve
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected: `HTTP 200`** — shifts swapped, both employees notified

---

### TC-HR-28 — Time Off Request and Approval

```http
POST /api/staff/time-off-requests
Authorization: Bearer <STAFF_TOKEN>

{
  "employeeId": "<EMPLOYEE_ID_ANITA>",
  "dateFrom": "2026-05-10",
  "dateTo": "2026-05-12",
  "reason": "Family function"
}
```

**Expected: `HTTP 201`**

**Manager approves:**
```http
POST /api/staff/time-off-requests/<requestId>/approve
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected: `HTTP 200`** — Anita's shifts in that period marked as approved-off

---

### TC-HR-29 — Labor Cost As % of Current-Day Sales

```http
GET /api/staff/shifts/labor-cost-live?date=2026-05-04
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected:**
```json
{
  "date": "2026-05-04",
  "currentTime": "14:30",
  "hoursWorkedSoFar": 18.5,
  "laborCostSoFar": 4625.00,
  "netSalesSoFar": 28000.00,
  "laborCostPercent": 16.52,
  "scheduledHoursRemaining": 11.5,
  "projectedDayLaborCost": 7500.00
}
```

---

## 3. Attendance — Clock In/Out & Geofencing

> **[GAP — GEOFENCING NOT IMPLEMENTED]**  
> GPS location validation is not yet built. The attendance controller accepts clock-in requests but does NOT validate coordinates against a configured geofence radius. Tests TC-HR-30 (geofenceStatus field), TC-HR-32 (GEOFENCE_VIOLATION), and TC-HR-33 (IP fallback) will behave differently than specified.  
> **What to implement:** A geofencing provider that checks `latitude/longitude` against the tenant's configured restaurant coordinates + radius. Return `geofenceStatus: "WITHIN_RANGE" | "OUTSIDE_RANGE"` and enforce or warn based on tenant config.

---

### TC-HR-30 — On-Time Clock In within Geofence

> **[GAP]** The `geofenceStatus` field is not currently returned. Clock-in will succeed but response will not include `geofenceStatus`. Test that clock-in itself works; skip geofenceStatus assertion until implemented.

```http
POST /api/staff/attendance/clock-in
Authorization: Bearer <STAFF_TOKEN>
Content-Type: application/json

{
  "shiftId": "<SHIFT_ID_ANITA>",
  "timestamp": "2026-05-04T09:00:00+05:30",
  "location": {
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "deviceIp": "192.168.1.105"
}
```

**Expected now (before geofencing): `HTTP 200`**
```json
{
  "attendanceId": "<uuid>",
  "status": "CLOCKED_IN",
  "lateMinutes": 0,
  "flaggedAsLate": false
}
```

**Expected after geofencing implemented:**
```json
{
  "attendanceId": "<uuid>",
  "status": "CLOCKED_IN",
  "lateMinutes": 0,
  "flaggedAsLate": false,
  "geofenceStatus": "WITHIN_RANGE"
}
```

**Save:** `ATTENDANCE_ID`

---

### TC-HR-31 — Late Clock In (8 Minutes Late)

```http
POST /api/staff/attendance/clock-in

{
  "shiftId": "<SHIFT_ID_ANITA>",
  "timestamp": "2026-05-04T09:08:00+05:30",
  "location": { "latitude": 12.9716, "longitude": 77.5946 }
}
```

**Expected:**
```json
{
  "status": "CLOCKED_IN",
  "lateMinutes": 8,
  "flaggedAsLate": true
}
```

---

### TC-HR-32 — Clock In from Outside Geofence

> **[GAP — NOT IMPLEMENTED]** Geofencing not built. This test will currently return HTTP 200 (clock-in accepted) instead of blocking with GEOFENCE_VIOLATION.  
> **Expected behavior after implementation:**

```http
POST /api/staff/attendance/clock-in

{
  "shiftId": "<SHIFT_ID_ANITA>",
  "timestamp": "2026-05-04T09:00:00+05:30",
  "location": {
    "latitude": 13.0827,
    "longitude": 80.2707
  }
}
```

(Chennai coordinates — clearly outside Bangalore restaurant)

**Expected after geofencing implemented:**
```json
{
  "geofenceStatus": "OUTSIDE_RANGE",
  "distanceFromRestaurant": 290000,
  "allowed": false,
  "error": "GEOFENCE_VIOLATION"
}
```

**What to implement:** Calculate Haversine distance between request coordinates and `tenant.restaurantLatitude/Longitude`. If distance > `tenant.geofenceRadius` (default 200m), block or flag based on `tenant.geofenceEnforcement` setting (`BLOCK` | `WARN`).

---

### TC-HR-33 — Clock In via Restaurant IP (Geofence Fallback)

> **[GAP — NOT IMPLEMENTED]** IP-based geofence fallback not built. Test will succeed (clock-in accepted) but without IP validation logic.  
> **What to implement:** Store `tenant.allowedIpRanges[]`. If GPS not provided, check `deviceIp` against allowed ranges as a fallback verification method.

```http
POST /api/staff/attendance/clock-in

{
  "shiftId": "<SHIFT_ID_ANITA>",
  "timestamp": "2026-05-04T09:00:00+05:30",
  "location": null,
  "deviceIp": "192.168.1.105"
}
```

(GPS disabled, but device on restaurant WiFi)

**Expected after implementation: `HTTP 200`** — IP match provides location verification fallback

---

### TC-HR-34 — No-Show Alert (No Clock-In After Grace Period)

**Scenario:** Anita's shift starts at 09:00. Current time is 09:20 (20 minutes later). No clock-in.

**Trigger:** Background job runs every 15 minutes checking for no-shows

**Expected:** `NO_SHOW` notification created:
```sql
SELECT type, priority, message FROM notifications
WHERE type = 'NO_SHOW' AND tenant_id = '<TENANT_ID>'
ORDER BY created_at DESC LIMIT 1;
-- message: "Anita Patel has not clocked in — shift started at 09:00"
-- priority: CRITICAL
```

---

### TC-HR-35 — Clock Out — Calculate Hours

```http
POST /api/staff/attendance/clock-out
Authorization: Bearer <STAFF_TOKEN>

{
  "attendanceId": "<ATTENDANCE_ID>",
  "timestamp": "2026-05-04T17:05:00+05:30",
  "location": { "latitude": 12.9716, "longitude": 77.5946 }
}
```

**Expected:**
```json
{
  "attendanceId": "<ATTENDANCE_ID>",
  "clockIn": "2026-05-04T09:00:00+05:30",
  "clockOut": "2026-05-04T17:05:00+05:30",
  "totalHoursWorked": 8.08,
  "regularHours": 8.08,
  "overtimeHours": 0,
  "breakCompliance": "COMPLIANT",
  "status": "COMPLETED"
}
```

---

### TC-HR-36 — Clock Out Early — Flag

```http
POST /api/staff/attendance/clock-out

{
  "attendanceId": "<ATTENDANCE_ID>",
  "timestamp": "2026-05-04T15:00:00+05:30"
}
```

Shift ends 17:00, clocked out at 15:00 (2 hours early)

**Expected:**
```json
{
  "earlyDepartureMinutes": 120,
  "flaggedAsEarlyDeparture": true,
  "totalHoursWorked": 6.0
}
```

---

### TC-HR-37 — Manager Edits Clock-In Time — Audit Log Required

```http
PATCH /api/staff/attendance/<ATTENDANCE_ID>
Authorization: Bearer <MANAGER_TOKEN>

{
  "clockIn": "2026-05-04T09:05:00+05:30",
  "editReason": "Anita was at back entrance — was 5 minutes before app shows"
}
```

**Expected: `HTTP 200`** — clock-in updated

**Audit log:**
```sql
SELECT event_type, old_value, new_value, performed_by
FROM audit_logs
WHERE event_type = 'CLOCK_IN_EDITED' AND entity_id = '<ATTENDANCE_ID>';
-- old_value: "09:00", new_value: "09:05", performed_by: <managerId>
-- editReason stored
```

---

## 4. Break Tracking & Overtime

### TC-HR-40 — Log Break and Verify Compliance

```http
POST /api/staff/attendance/<ATTENDANCE_ID>/breaks
Authorization: Bearer <STAFF_TOKEN>

{
  "breakStart": "2026-05-04T13:00:00+05:30",
  "breakEnd": "2026-05-04T13:30:00+05:30",
  "type": "MEAL_BREAK"
}
```

**Expected: `HTTP 201`** — 30-min break logged, compliance checked

---

### TC-HR-41 — Break Too Short — Compliance Alert

**For an 8-hour shift, most labor laws require ≥30 min meal break**

```http
POST /api/staff/attendance/<ATTENDANCE_ID>/breaks

{
  "breakStart": "2026-05-04T13:00:00+05:30",
  "breakEnd": "2026-05-04T13:15:00+05:30"
}
```

15-minute break for 8-hour shift → non-compliant

**Expected:**
```json
{
  "breakMinutes": 15,
  "complianceStatus": "NON_COMPLIANT",
  "warning": "Break duration (15 min) is below required minimum (30 min) for shifts over 6 hours"
}
```

---

### TC-HR-42 — Weekly Overtime Calculation (FLSA >40 Hours)

> **[GAP — NOT IMPLEMENTED]** FLSA overtime logic (>40 hours/week triggers 1.5× multiplier) is not built. The weekly summary endpoint exists and returns `totalHours` correctly, but does NOT split into `regularHours`/`overtimeHours` or calculate `overtimePay`.  
> **What to implement:** In `AttendanceService`, add a weekly aggregation job that: sums hours per employee per FLSA week (Mon–Sun), splits into `regularHours` (max 40) + `overtimeHours` (remainder), calculates `regularPay = regularHours × hourlyRate` and `overtimePay = overtimeHours × hourlyRate × 1.5`.

**Setup:** Anita works 42 hours this week (Mon-Fri, 8.4 hrs/day):

```http
GET /api/staff/attendance/overtime-summary?employeeId=<EMPLOYEE_ID_ANITA>&weekOf=2026-05-04
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected now (before FLSA implementation):** `HTTP 200` with `totalHours: 42` but no overtime breakdown.

**Expected after FLSA implemented:**
```json
{
  "employeeId": "<EMPLOYEE_ID_ANITA>",
  "weekOf": "2026-W19",
  "regularHours": 40,
  "overtimeHours": 2,
  "regularPay": 7200.00,
  "overtimePay": 540.00,
  "totalPay": 7740.00,
  "overtimeMultiplier": 1.5
}
```

Calculation: regular = 40 × ₹180 = ₹7200; OT = 2 × ₹180 × 1.5 = ₹540 ✓

---

### TC-HR-43 — Overtime Approaching Alert (38 Hours)

> **[GAP — NOT IMPLEMENTED]** `OVERTIME_APPROACHING` notification type not implemented (depends on FLSA calculation being in place first).  
> **What to implement:** When weekly hours cross 38 (configurable threshold), fire `OVERTIME_APPROACHING` notification to manager and employee.

**Trigger:** Anita hits 38 hours in the FLSA week

**Expected after implementation:**
```sql
SELECT type, message FROM notifications
WHERE type = 'OVERTIME_APPROACHING' AND tenant_id = '<TENANT_ID>';
-- message: "Anita Patel has worked 38 of 40 regular hours this week"
-- priority: IMPORTANT
```

---

### TC-HR-44 — Timesheet Approval Required Before Payroll

```http
GET /api/staff/attendance/timesheet?employeeId=<EMPLOYEE_ID_ANITA>&weekOf=2026-05-04
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected:** Timesheet with `approvalStatus: "PENDING"`

```http
POST /api/staff/attendance/timesheet/<timesheetId>/approve
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected: `HTTP 200`** — `approvalStatus: "APPROVED"`

---

## 5. Task Management with Photo Verification

### TC-HR-50 — Create Critical Opening Task

```http
POST /api/staff/tasks
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "title": "Prep Station Sanitization Check",
  "description": "Sanitize all prep surfaces. Take photo as proof.",
  "assignedTo": "<EMPLOYEE_ID_ANITA>",
  "dueDate": "2026-05-04",
  "dueTime": "09:30:00",
  "category": "OPENING",
  "requiresPhotoVerification": true,
  "isCritical": true
}
```

**Expected: `HTTP 201`**

**Save:** `TASK_ID`

---

### TC-HR-51 — Create All 5 Task Categories

Create one task for each: `OPENING`, `CLOSING`, `SIDEWORK`, `PREP`, `SAFETY`

Each should return `HTTP 201` with correct `category` field.

---

### TC-HR-52 — Employee Completes Task with Photo

> **[PARTIAL]** `TaskController` exists and accepts task completion. Photo upload is handled via `file-service`. However, the end-to-end flow — upload photo → get URL → store `photoVerificationUrl` in task record — may not be fully wired. Test the happy path and verify whether `photoVerificationUrl` is populated in the DB. If it returns `null`, the file-service integration step is missing.

```http
POST /api/staff/tasks/<TASK_ID>/complete
Authorization: Bearer <STAFF_TOKEN>
Content-Type: multipart/form-data

photo: [binary_image.jpg]
notes: "Station fully sanitized and ready"
completedAt: 2026-05-04T09:25:00+05:30
```

**Expected: `HTTP 200`**
```json
{
  "taskId": "<TASK_ID>",
  "status": "COMPLETED",
  "completedAt": "2026-05-04T09:25:00+05:30",
  "photoVerificationUrl": "https://storage.supabase.co/...",
  "completedBy": "<EMPLOYEE_ID_ANITA>"
}
```

**Database:**
```sql
SELECT status, completed_at, photo_verification_url, completed_by
FROM tasks WHERE id = '<TASK_ID>';
-- status = 'COMPLETED', photo_verification_url NOT NULL
```

---

### TC-HR-53 — Complete Photo-Required Task Without Photo — Blocked

```http
POST /api/staff/tasks/<TASK_ID>/complete
Authorization: Bearer <STAFF_TOKEN>
Content-Type: application/json

{
  "notes": "Done (no photo)"
}
```

**Expected: `HTTP 400`**
```json
{ "error": "PHOTO_REQUIRED", "message": "This task requires a photo for verification" }
```

---

### TC-HR-54 — Non-Photo Task — Complete Without Photo

```http
POST /api/staff/tasks
Authorization: Bearer <MANAGER_TOKEN>

{
  "title": "Wipe Tables",
  "assignedTo": "<EMPLOYEE_ID_ANITA>",
  "requiresPhotoVerification": false,
  "isCritical": false
}
```

```http
POST /api/staff/tasks/<noPhotoTaskId>/complete
Authorization: Bearer <STAFF_TOKEN>
Content-Type: application/json

{ "completedAt": "2026-05-04T10:00:00+05:30" }
```

**Expected: `HTTP 200`** — no photo needed

---

### TC-HR-55 — Employee Completes Another Employee's Task — Blocked

```http
POST /api/staff/tasks/<TASK_ID>/complete
Authorization: Bearer <MANAGER_TOKEN>
(Manager's staff token for a different employee)
```

**If task is assigned to Anita but completed by a different KITCHEN_STAFF:**

**Expected: `HTTP 403`**

---

### TC-HR-56 — Critical Task Alert — 30 Minutes Before Deadline

**Setup:** Critical task with dueTime = 10:00:00. Current time = 09:30 (30 min before). Task still PENDING.

**Expected:** `CRITICAL_TASK_OVERDUE` notification fires immediately

```sql
SELECT type, priority, message FROM notifications
WHERE type = 'CRITICAL_TASK_OVERDUE' AND tenant_id = '<TENANT_ID>'
ORDER BY created_at DESC LIMIT 1;
-- message: "Prep Station Sanitization Check is incomplete — due in 30 minutes"
-- priority: CRITICAL
```

---

### TC-HR-57 — Critical Task Completed Before Alert Window — No Alert

**Complete task at 09:29 (31 min before deadline):**
```http
POST /api/staff/tasks/<TASK_ID>/complete
Authorization: Bearer <STAFF_TOKEN>
```

At 09:30 mark: **No alert should fire** (task is COMPLETED)

---

### TC-HR-58 — Manager Task Dashboard — Remote View

```http
GET /api/staff/tasks/dashboard?date=2026-05-04
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected:**
```json
{
  "date": "2026-05-04",
  "totalTasks": 5,
  "completed": 3,
  "pending": 1,
  "overdue": 1,
  "critical": { "total": 2, "completed": 2, "overdue": 0 },
  "tasks": [
    {
      "title": "Prep Station Sanitization Check",
      "assignedTo": "Anita Patel",
      "category": "OPENING",
      "status": "COMPLETED",
      "completedAt": "2026-05-04T09:25:00+05:30",
      "photoUrl": "https://storage.supabase.co/..."
    }
  ]
}
```

---

### TC-HR-59 — Photo Upload Validation

**File too large (> 10MB):**
```http
POST /api/staff/tasks/<TASK_ID>/complete
Content-Type: multipart/form-data

photo: [15MB_image.jpg]
```

**Expected: `HTTP 413`** — Payload too large

**Wrong format (PDF):**
```http
photo: [document.pdf]
```

**Expected: `HTTP 415`** — Unsupported media type

---

## 6. Shift Feedback

### TC-HR-60 — Submit Feedback Rating 5 (Excellent)

```http
POST /api/staff/shift-feedback
Authorization: Bearer <STAFF_TOKEN>
Content-Type: application/json

{
  "shiftId": "<SHIFT_ID_ANITA>",
  "employeeId": "<EMPLOYEE_ID_ANITA>",
  "rating": 5,
  "issues": [],
  "equipmentFlags": [],
  "moraleNote": "Excellent service, great team today",
  "submittedAt": "2026-05-04T17:10:00+05:30"
}
```

**Expected: `HTTP 201`**

---

### TC-HR-61 — Submit Feedback Rating 1 with Issues

```http
POST /api/staff/shift-feedback

{
  "shiftId": "<SHIFT_ID_ANITA>",
  "rating": 1,
  "issues": ["UNDERSTAFFED", "POOR_COMMUNICATION"],
  "equipmentFlags": ["FRIDGE_TEMPERATURE_ISSUE", "DISHWASHER_BROKEN"],
  "moraleNote": "Very stressful — 2 people called out, equipment failing"
}
```

**Expected: `HTTP 201`** — Low rating (≤2) triggers immediate manager notification

```sql
SELECT type, priority FROM notifications
WHERE type = 'LOW_SHIFT_RATING' AND tenant_id = '<TENANT_ID>';
-- priority: IMPORTANT
```

---

### TC-HR-62 — Equipment Flag Triggers Maintenance Notification

After TC-HR-61 with `FRIDGE_TEMPERATURE_ISSUE`:

```sql
SELECT type, message FROM notifications
WHERE type = 'EQUIPMENT_FLAG' AND tenant_id = '<TENANT_ID>';
-- message: "Equipment issue flagged: Fridge temperature problem (reported by Anita Patel)"
```

---

### TC-HR-63 — Rating Outside 1–5 Range

```http
POST /api/staff/shift-feedback

{
  "rating": 6,
  "shiftId": "<SHIFT_ID_ANITA>"
}
```

**Expected: `HTTP 400`** — rating must be between 1 and 5

```http
{ "rating": 0 }
```

**Expected: `HTTP 400`**

---

### TC-HR-64 — Duplicate Feedback for Same Shift

```http
POST /api/staff/shift-feedback (second submission same shiftId + employeeId)
```

**Expected: `HTTP 409`** — already submitted for this shift

---

### TC-HR-65 — Employee Cannot Submit Feedback for Another's Shift

```http
POST /api/staff/shift-feedback
Authorization: Bearer <STAFF_TOKEN>  (Anita)

{
  "shiftId": "<SHIFT_ID_RAVI>",  (Ravi's shift)
  "employeeId": "<EMPLOYEE_ID_ANITA>",
  "rating": 3
}
```

**Expected: `HTTP 403`** — can only submit feedback for own shift

---

## 7. Tip Pool Calculation

### TC-HR-70 — Tip Pool: Hours-Worked Distribution Model

**Set pool rules:**
```http
POST /api/staff/tip-pools/rules
Authorization: Bearer <OWNER_TOKEN>

{
  "model": "POOLED",
  "distributionBasis": "HOURS_WORKED",
  "roles": [
    { "role": "SERVER", "sharePercent": 70 },
    { "role": "KITCHEN_STAFF", "sharePercent": 20 },
    { "role": "MANAGER", "sharePercent": 10 }
  ]
}
```

**Calculate distribution:**
```http
POST /api/staff/tip-pools/calculate
Authorization: Bearer <MANAGER_TOKEN>

{
  "date": "2026-05-04",
  "totalTips": 2200.00,
  "participants": [
    { "employeeId": "<EMPLOYEE_ID_ANITA>", "hoursWorked": 8.0, "role": "KITCHEN_STAFF" },
    { "employeeId": "<EMPLOYEE_ID_RAVI>", "hoursWorked": 12.0, "role": "MANAGER" }
  ]
}
```

**Expected:**
```json
{
  "totalTips": 2200.00,
  "payouts": [
    {
      "employeeId": "<EMPLOYEE_ID_ANITA>",
      "role": "KITCHEN_STAFF",
      "poolSharePercent": 20,
      "amount": 440.00
    },
    {
      "employeeId": "<EMPLOYEE_ID_RAVI>",
      "role": "MANAGER",
      "poolSharePercent": 10,
      "amount": 220.00
    }
  ],
  "totalDistributed": 660.00,
  "serverPool": 1540.00
}
```

---

### TC-HR-71 — Sum of Payouts Equals Total Tips

```sql
SELECT SUM(amount) FROM tip_payout_entries
WHERE tip_pool_id = '<tipPoolId>';
-- Must equal 2200.00 exactly (no rounding loss)
```

---

### TC-HR-72 — Odd Tip Amount — Rounding Rule

```http
POST /api/staff/tip-pools/calculate

{
  "totalTips": 2201.00,
  "participants": [
    { "role": "KITCHEN_STAFF", "hoursWorked": 8 },
    { "role": "MANAGER", "hoursWorked": 12 }
  ]
}
```

**Expected:** Rounding handled — total distributed still = 2201.00 (one participant gets remainder)

---

### TC-HR-73 — Employee with 0 Hours Gets ₹0

```http
POST /api/staff/tip-pools/calculate

{
  "participants": [
    { "employeeId": "<EMPLOYEE_ID_ANITA>", "hoursWorked": 0, "role": "KITCHEN_STAFF" }
  ]
}
```

**Expected:** Anita gets ₹0, no division by zero

---

### TC-HR-74 — Duplicate Tip Pool for Same Date — Blocked

```http
POST /api/staff/tip-pools/calculate (second time for same date)
```

**Expected: `HTTP 409`** — tip pool already created for 2026-05-04

---

### TC-HR-75 — Manager Adjusts One Payout — Audit Required

```http
PATCH /api/staff/tip-pools/<tipPoolId>/payouts/<anitaPayoutId>
Authorization: Bearer <MANAGER_TOKEN>

{
  "amount": 500.00,
  "adjustmentReason": "Anita handled bar section too — additional tip allocation"
}
```

**Expected: `HTTP 200`** — adjustment saved with audit trail

```sql
SELECT event_type, old_value, new_value, performed_by
FROM audit_logs WHERE event_type = 'TIP_ADJUSTED';
-- old_value: 440.00, new_value: 500.00
```

---

## 8. Performance Goals

### TC-HR-80 — Create SPLH Goal for Manager

```http
POST /api/staff/performance-goals
Authorization: Bearer <MANAGER_TOKEN>

{
  "employeeId": "<EMPLOYEE_ID_RAVI>",
  "metric": "SPLH",
  "targetValue": 1000.00,
  "currentValue": 958.33,
  "period": "2026-05",
  "unit": "INR_PER_HOUR"
}
```

**Expected: `HTTP 201`**
```json
{
  "id": "<uuid>",
  "metric": "SPLH",
  "targetValue": 1000.00,
  "currentValue": 958.33,
  "progressPercent": 95.83,
  "status": "ON_TRACK"
}
```

---

### TC-HR-81 — Goal At Risk Alert

**Create goal where progress is severely behind:**
```http
POST /api/staff/performance-goals

{
  "metric": "AVG_CHECK_SIZE",
  "targetValue": 300.00,
  "currentValue": 180.00,
  "periodDaysElapsed": 25,
  "periodTotalDays": 31
}
```

Progress = 60%, but 80.6% of period elapsed → AT_RISK

**Expected:** `status: "AT_RISK"`, notification to manager

---

### TC-HR-82 — Employee Views Own Goals

```http
GET /api/staff/performance-goals?employeeId=<EMPLOYEE_ID_ANITA>
Authorization: Bearer <STAFF_TOKEN>
```

**Expected: `HTTP 200`** — only own goals

---

### TC-HR-83 — Staff Cannot View Other Employee's Goals

```http
GET /api/staff/performance-goals?employeeId=<EMPLOYEE_ID_RAVI>
Authorization: Bearer <STAFF_TOKEN>
```

**Expected: `HTTP 403`**

---

## 9. Certification Management

### TC-HR-90 — Add Certification with Expiry

```http
POST /api/staff/employees/<EMPLOYEE_ID_ANITA>/certifications
Authorization: Bearer <OWNER_TOKEN>

{
  "type": "FOOD_HANDLER",
  "issuedDate": "2025-03-01",
  "expiryDate": "2026-12-31",
  "issuingBody": "FSSAI"
}
```

**Expected: `HTTP 201`**

---

### TC-HR-91 — Certification Expiring in 45 Days — Daily Digest

**Setup:** Certification expiry = today + 45 days

**Expected:** Appears in daily digest:
```json
{ "expiringCertifications": [{ "employee": "Anita Patel", "type": "FOOD_HANDLER", "daysUntilExpiry": 45 }] }
```

---

### TC-HR-92 — Certification Expiring in 14 Days — IMPORTANT Notification

**Setup:** expiry = today + 14 days

**Expected:** `CERTIFICATION_EXPIRING` notification, `priority: IMPORTANT`

---

### TC-HR-93 — Certification Expiring in 3 Days — CRITICAL Notification

**Setup:** expiry = today + 3 days

**Expected:** `CERTIFICATION_EXPIRING` notification, `priority: CRITICAL`

---

### TC-HR-94 — Certification with No Expiry Date (Lifetime Cert)

```http
POST /api/staff/employees/<EMPLOYEE_ID_RAVI>/certifications

{
  "type": "FIRST_AID",
  "issuedDate": "2025-01-01",
  "expiryDate": null
}
```

**Expected: `HTTP 201`** — No expiry alerts ever generated

---

### TC-HR-95 — Renew Expiring Certification

```http
PATCH /api/staff/employees/<EMPLOYEE_ID_ANITA>/certifications/<certId>

{ "expiryDate": "2028-12-31", "renewedDate": "2026-05-04" }
```

**Expected: `HTTP 200`** — Expiry updated, existing alerts dismissed

---

## 10. RBAC Enforcement for Staff Module

### TC-HR-100 — Complete Role Matrix for Staff Endpoints

| Endpoint | Owner | Manager | Kitchen Staff |
|---|---|---|---|
| POST /staff/employees | ✓ 201 | ✗ 403 | ✗ 403 |
| GET /staff/employees | ✓ 200 (all) | ✓ 200 (team) | ✗ 403 |
| GET /staff/employees/:own | ✓ 200 | ✓ 200 | ✓ 200 |
| GET /staff/employees/:other | ✓ 200 | ✓ 200 | ✗ 403 |
| DELETE /staff/employees/:id | ✓ 200 | ✗ 403 | ✗ 403 |
| POST /staff/shifts/batch | ✓ 201 | ✓ 201 | ✗ 403 |
| GET /staff/shifts/my-schedule | ✓ 200 | ✓ 200 | ✓ 200 |
| POST /staff/shifts/publish | ✓ 200 | ✓ 200 | ✗ 403 |
| POST /staff/attendance/clock-in | ✓ | ✓ | ✓ (own shift) |
| POST /staff/tasks | ✓ 201 | ✓ 201 | ✗ 403 |
| POST /staff/tasks/:id/complete | ✓ | ✓ | ✓ (own task) |
| GET /staff/tasks/dashboard | ✓ 200 | ✓ 200 | ✗ 403 |
| POST /staff/shift-feedback | ✓ | ✓ | ✓ (own shift) |
| POST /staff/tip-pools/calculate | ✓ 200 | ✓ 200 | ✗ 403 |
| GET /staff/performance-goals | ✓ all | ✓ team | ✓ own only |
| POST /staff/employees/:id/certifications | ✓ 201 | ✗ 403 | ✗ 403 |

---

## GO/NO-GO Checklist — Staff & HR Epic

| Test | Required | Status |
|---|---|---|
| TC-HR-01 Employee creation | MANDATORY | ✅ Implemented |
| TC-HR-20 Batch schedule creation | MANDATORY | ✅ Implemented |
| TC-HR-23 Overlapping shift blocked | MANDATORY | ✅ Implemented |
| TC-HR-24 Clopen detection | MANDATORY | ✅ Implemented |
| TC-HR-30 Clock in (basic, no geofence) | MANDATORY | ✅ Implemented (geofenceStatus field absent) |
| TC-HR-32 Clock in outside geofence | MANDATORY | ❌ GAP — geofencing not built |
| TC-HR-33 IP fallback geofence | RECOMMENDED | ❌ GAP — geofencing not built |
| TC-HR-34 No-show alert | MANDATORY | ✅ Implemented |
| TC-HR-42 FLSA overtime calculation | MANDATORY | ❌ GAP — overtime logic not built |
| TC-HR-43 Overtime approaching alert | MANDATORY | ❌ GAP — depends on FLSA |
| TC-HR-52 Task completion with photo | MANDATORY | ⚠️ PARTIAL — verify photoVerificationUrl in DB |
| TC-HR-53 Photo-required task blocked | MANDATORY | ⚠️ PARTIAL — test and verify 400 |
| TC-HR-56 Critical task 30-min alert | MANDATORY | ✅ Implemented |
| TC-HR-60 Shift feedback submission | MANDATORY | ✅ Implemented |
| TC-HR-70 Tip pool distribution | MANDATORY | ✅ Implemented |
| TC-HR-71 Sum of payouts = total tips | MANDATORY | ✅ Implemented |
| TC-HR-90 Certification with expiry | MANDATORY | ✅ Implemented |
| TC-HR-100 Full RBAC matrix | MANDATORY | ✅ Implemented |

### Gaps to Implement (Staff Epic)

| # | Feature | What to Build | Effort |
|---|---|---|---|
| G-STAFF-01 | **Geofencing provider** | Haversine distance check on clock-in. Compare `lat/lng` to `tenant.restaurantCoords`. Return `geofenceStatus` field. Configurable radius (default 200m) and enforcement (`BLOCK` or `WARN`). | Medium |
| G-STAFF-02 | **IP fallback** | If GPS not sent, check `deviceIp` against `tenant.allowedIpRanges[]` as fallback location verification. | Small |
| G-STAFF-03 | **FLSA overtime engine** | Weekly aggregation: sum clock-in/out durations per employee per Mon–Sun week. Split at 40h. Calculate `regularPay` + `overtimePay` (1.5×). Expose on `GET /staff/attendance/overtime-summary`. | Medium |
| G-STAFF-04 | **Overtime approaching notification** | When employee's weekly hours cross configurable threshold (default 38h), fire `OVERTIME_APPROACHING` push + email to manager and employee. | Small (depends on G-STAFF-03) |
| G-STAFF-05 | **Task photo verification wire-up** | Ensure `POST /staff/tasks/:id/complete` with `multipart/form-data` photo: (1) uploads to file-service, (2) stores returned URL in `tasks.photo_verification_url`, (3) enforces `requiresPhotoVerification=true` blocks completion without photo. | Small |

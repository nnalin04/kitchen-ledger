# EPIC: STAFF — Staff & HR Service

**Phase:** 2 | **Weeks:** 4–9
**Service:** `services/staff-service` (Java 21 + Spring Boot 4.0.5) | **Port:** 8088
**Goal:** Employee records, shift scheduling, clock-in/out attendance with overtime calculation, daily task management with photo verification, shift feedback, tip pool distribution, performance goals, and certification tracking.
**Depends on:** INFRA-3 (skeleton), AUTH (user lookup for linked employees)
**Blocks:** Web/Mobile staff screens, Notification Service (schedule publish events)

---

## STAFF-1: Database Schema Migration

- [ ] Write `V1__staff_schema.sql` (exact from TRD §3.14). All tables with RLS enabled:
  - `employees` — id, tenant_id, user_id UUID (optional link to auth.users), full_name, phone, role VARCHAR(50), employment_type CHECK('full_time','part_time','contract'), hourly_rate NUMERIC(10,2), hire_date, status CHECK('active','inactive','terminated'), emergency_contact JSONB, availability JSONB, soft-delete; index on (tenant_id) WHERE deleted_at IS NULL
  - `shifts` — id, tenant_id, employee_id FK, shift_date DATE, start_time TIME, end_time TIME, role, station, status CHECK('scheduled','clocked_in','completed','no_show','cancelled'), actual_clock_in TIMESTAMPTZ, actual_clock_out TIMESTAMPTZ, break_minutes INT, total_hours NUMERIC(5,2), overtime_hours NUMERIC(5,2), notes; index on (tenant_id, shift_date DESC) and (employee_id, shift_date DESC)
  - `tasks` — id, tenant_id, title, description, category CHECK('opening','closing','sidework','prep','safety','general'), assigned_to FK, shift_id FK, due_date DATE, status CHECK('pending','in_progress','completed','skipped'), requires_photo BOOLEAN, completed_at, photo_url; index on (tenant_id, due_date DESC)
  - `shift_feedback` — id, tenant_id, shift_id FK, employee_id FK, rating SMALLINT CHECK(1-5), issues JSONB, equipment_flags JSONB, morale_note TEXT, submitted_at; UNIQUE(shift_id, employee_id) — one feedback per employee per shift
  - `tip_pools` — id, tenant_id, pool_date DATE, shift_type VARCHAR, total_tips NUMERIC(12,2), distribution_rules JSONB, status CHECK('open','calculated','distributed'), calculated_at
  - `tip_pool_payouts` — id, tip_pool_id FK, employee_id FK, amount NUMERIC(10,2), basis VARCHAR(50)
  - `attendance` — id, tenant_id, employee_id FK, shift_id FK, date DATE, clock_in TIMESTAMPTZ, clock_out TIMESTAMPTZ, break_minutes INT, total_hours NUMERIC(5,2), overtime_hours NUMERIC(5,2), status CHECK('present','late','absent','excused'); index on (tenant_id, date DESC)
  - `performance_goals` — id, tenant_id, employee_id FK, metric VARCHAR(100), target_value NUMERIC(12,2), current_value NUMERIC(12,2), period_start DATE, period_end DATE, status CHECK('active','achieved','missed')
  - `certifications` — id, tenant_id, employee_id FK, name, issued_date, expiry_date, document_url
  - RLS + `tenant_isolation` policy on ALL tables
- [ ] **Test:** Migration applies cleanly. RLS isolates tenant data.

---

## STAFF-2: JPA Entities, Repositories & DTOs

- [ ] All JPA entities (Employee, Shift, Task, ShiftFeedback, TipPool, TipPoolPayout, Attendance, PerformanceGoal, Certification)
- [ ] Repository custom queries:
  - `ShiftRepository` — `findByTenantIdAndShiftDateBetween`, `findByEmployeeIdAndShiftDate`, `existsOverlappingShift(employeeId, date, startTime, endTime, excludeId)`
  - `AttendanceRepository` — `findByTenantIdAndDateBetween`, `findByEmployeeIdAndDate`, `sumHoursByEmployeeIdAndDateBetween`
  - `TipPoolRepository` — `findByTenantIdAndPoolDate`
- [ ] Request/Response DTOs + MapStruct mappers for all entities
- [ ] `ShiftStatus`, `TaskCategory`, `EmploymentType`, `TipDistributionType` enums

---

## STAFF-3: Employee CRUD

- [ ] `EmployeeService.java`:
  - `createEmployee(tenantId, userId, request)` — validate role is valid, set status=active
  - `updateEmployee(tenantId, employeeId, userId, request)` — audit log on role/rate changes
  - `softDelete(tenantId, employeeId, userId)` — [owner only]; check no future scheduled shifts
  - `listEmployees(tenantId, filter)` — filter by status, role; [owner/manager only]
  - `getEmployeeDetail(tenantId, employeeId, requestingUserId, requestingRole)` — staff can only view their own profile; manager/owner can view any
- [ ] `EmployeeController.java`
- [ ] **Test:** Create employee → verify in list. Kitchen staff cannot fetch other employee. Owner can fetch any.

---

## STAFF-4: Shift Scheduling

- [ ] `ShiftService.java`:
  - `createShift(tenantId, userId, request)` — [owner/manager]:
    - Validate employee belongs to tenant
    - Check no overlapping shifts: `existsOverlappingShift(employeeId, date, start, end)`
    - Warn (but don't block) if back-to-back close-open < 8h gap
    - Warn if employee availability JSONB shows unavailability on that day
  - `updateShift(tenantId, shiftId, userId, request)` — [owner/manager]; audit log
  - `cancelShift(tenantId, shiftId, userId)` — [owner/manager]; set status=CANCELLED (soft approach — no hard delete per TRD §1.9)
  - `publishSchedule(tenantId, userId, dateRange)` — bulk update shifts in range to SCHEDULED; publish `staff.schedule.published` event (future: Notification Service sends to each employee)
  - `getWeeklySchedule(tenantId, weekStart)` — all employees + shifts for 7-day range, grouped by employee
- [ ] `ShiftController.java` + `GET /api/staff/schedule` + `POST /api/staff/schedule/publish`
- [ ] **Test:** Create shift → overlap same employee same time → 409. Create 8pm-close shift then 6am-open → warns. Publish → event published.

---

## STAFF-5: Attendance & Clock-In/Out

- [ ] `AttendanceService.java`:
  - `clockIn(tenantId, employeeId, shiftId, timestamp)`:
    - Find today's shift for employee
    - Create (or update) `Attendance` record with `clock_in = timestamp`
    - Update linked shift status → CLOCKED_IN
    - Late detection: if `clock_in > shift.start_time + 10 minutes` → `attendance.status = LATE`
  - `clockOut(tenantId, employeeId, shiftId, timestamp, breakMinutes)`:
    - Set `clock_out = timestamp`
    - `total_hours = (clock_out - clock_in - break_minutes_as_duration).toHours()` using BigDecimal
    - `overtime_hours = MAX(0, total_hours - 8)` — daily overtime threshold
    - Update linked shift → COMPLETED, set `total_hours`, `overtime_hours`, `actual_clock_out`
  - `editAttendance(tenantId, attendanceId, userId, request)` — [owner/manager only]; requires explanation note; writes audit log
  - `getTimesheetReport(tenantId, employeeId, weekStart)` — sum hours + overtime per day per employee
- [ ] `AttendanceController.java`:
  - `POST /api/staff/attendance/clock-in` — staff can clock own record; validates geofence token (Phase 2: actual GPS; MVP: just timestamp)
  - `POST /api/staff/attendance/clock-out`
  - `GET /api/staff/attendance` — [owner/manager]
  - `PATCH /api/staff/attendance/{id}` — [owner/manager]
  - `GET /api/staff/attendance/report` — weekly timesheet
- [ ] **Test:** Clock in 15min late → status=LATE. Clock out after 10hrs → overtime_hours=2. Manager edit → audit log written.

---

## STAFF-6: Task Management & Photo Verification

- [ ] `TaskService.java`:
  - `createTask(tenantId, userId, request)` — [owner/manager]; set `requires_photo` flag
  - `updateTaskStatus(tenantId, taskId, userId, status)` — all roles can update own assigned tasks; owner/manager can update any
  - `completeTask(tenantId, taskId, userId, photoUrl)`:
    - If `requires_photo=true` AND `photoUrl` is null → throw `ValidationException("photo_url", "Photo required for this task")`
    - Set status=COMPLETED, completed_at, photo_url
  - `getDailyChecklist(tenantId, date)` — all tasks for date grouped by category (opening/closing/sidework/prep/safety), sorted by status (pending first)
  - Critical task alert check: run in `@Scheduled(cron = "0 */15 * * * *")` every 15 min:
    - Find tasks WHERE `requires_photo=true AND status='pending' AND due_date=TODAY` AND current time is within 30 min of relevant shift end time
    - Publish event (future: Notification Service sends push to manager)
- [ ] `TaskController.java`
- [ ] **Test:** Create photo-required task → complete without photo URL → 422. Complete with photo URL → status=COMPLETED. Checklist grouped by category.

---

## STAFF-7: Shift Feedback

- [ ] `ShiftFeedbackService.java`:
  - `submitFeedback(tenantId, shiftId, employeeId, request)`:
    - Check UNIQUE(shift_id, employee_id) — already submitted → 409
    - Validate shift belongs to employee on that date
    - Save rating + issues JSONB + equipment_flags JSONB + morale_note
  - `getFeedbackSummary(tenantId, weeks)` — [owner/manager]:
    - Average rating per week (last N weeks)
    - Issue frequency: group issues by type, count occurrences
    - Equipment flags count by equipment name
    - Return trend data suitable for chart
- [ ] `ShiftFeedbackController.java`
- [ ] **Test:** Submit feedback → 201. Submit again for same shift → 409. Summary averages correct over 3 weeks.

---

## STAFF-8: Tip Pool Management

- [ ] `TipPoolService.java`:
  - `createTipPool(tenantId, userId, request)` — set distribution_rules JSONB: `{ "type": "BY_HOURS" | "BY_ROLE" | "BY_POINTS", "rules": {...} }`
  - `calculateDistribution(tenantId, poolId, userId)` — [owner/manager]:
    - Load all shifts for `pool_date` + `shift_type`
    - Apply distribution type:
      - **BY_HOURS**: `payout_i = (employee_hours_i / total_hours) × total_tips`
      - **BY_ROLE**: each role has a fixed `percentage` in rules; normalize if < 100%
      - **BY_POINTS**: each employee assigned points; `payout_i = (points_i / total_points) × total_tips`
    - Create `tip_pool_payouts` records (delete previous if recalculating)
    - Set status=CALCULATED, calculated_at=NOW()
    - All BigDecimal arithmetic; ensure payouts sum exactly equals `total_tips` (assign remainder to last payout)
  - `distributePool(tenantId, poolId, userId)` — [owner only]; set status=DISTRIBUTED; audit log
  - `getPayouts(tenantId, poolId)` — per-employee amounts + basis explanation
- [ ] `TipPoolController.java`
- [ ] **Test:** 3-person pool BY_HOURS (4h/3h/2h = 9h total, ₹900 total): server=₹400, bartender=₹300, busser=₹200. Sum=₹900. Distribute → status=DISTRIBUTED.

---

## STAFF-9: Performance Goals & Certifications

- [ ] `PerformanceGoalService.java`:
  - `createGoal(tenantId, employeeId, userId, request)` — [owner/manager]
  - `updateGoalProgress(tenantId, goalId, userId, currentValue)` — update `current_value`; if ≥ target AND period not ended → status=ACHIEVED
  - `markExpiredGoals()` — `@Scheduled(cron = "0 0 0 * * *")`: goals WHERE `period_end < TODAY AND status=active` → status=MISSED
- [ ] `CertificationService.java`:
  - `addCertification(tenantId, employeeId, userId, request)`
  - `deleteCertification(tenantId, certId, userId)`
  - Expiry alert: `@Scheduled(cron = "0 0 8 * * *")` — certs expiring in 30 days → publish event
- [ ] `PerformanceController.java` — `GET/POST/PATCH /api/staff/employees/{id}/goals`
- [ ] `CertificationController.java`
- [ ] **Test:** Create goal with 30-day period → update progress to target → status=ACHIEVED. Expire old goal via scheduled job.

---

## STAFF-10: RabbitMQ Consumer & Internal Endpoint

- [ ] `StaffEventConsumer.java`:
  - Queue: `staff-service`, routing key: `auth.user.registered`
  - `onUserRegistered(event)` — if role=owner, optionally create linked Employee record (can be skipped if owner doesn't need scheduling)
- [ ] `GET /internal/staff/employees/{id}` — employee detail for other services; INTERNAL_SERVICE_SECRET required

---

## STAFF-11: Tests

- [ ] Unit tests (Mockito):
  - `ShiftService` — overlap detection logic
  - `AttendanceService` — total hours calculation, overtime boundary (exactly 8h = 0 overtime, 8h1min = 1min overtime)
  - `TipPoolService` — all 3 distribution types; verify sum = total_tips; verify remainder handling
  - `TaskService` — photo requirement enforcement
- [ ] Integration tests (Testcontainers):
  - Clock-in → clock-out → verify hours + overtime stored
  - Tip pool lifecycle: create → calculate → distribute → verify payouts
  - Task checklist: create opening tasks → complete with photo → verify status
- [ ] Coverage gate: **≥ 80% line coverage**

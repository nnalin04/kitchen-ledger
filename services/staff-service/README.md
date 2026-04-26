# Staff Service

Manages the people side of running a restaurant — scheduling, attendance, task assignment, tip distribution, certifications, and HR records. This service gives managers the tools to coordinate their team without paper rosters or spreadsheets, and gives staff members visibility into their own schedules and tasks.

---

## Core Concepts

### Employees vs. Users

An **employee** record holds HR data: role, contact details, employment dates, salary information, and HR documents. An **employee** is linked to a **user account** (managed by the Auth service), but the two are separate — an employee record can exist before the person has accepted their app invite.

### Shifts

A **shift** is a scheduled block of work assigned to an employee. Shifts are created in `DRAFT` status, then published to make them visible to staff. Employees can view their own shifts; managers can view the full roster.

Shift states: `DRAFT → PUBLISHED → COMPLETED` (or `CANCELLED`)

Publishing a shift batch triggers push notifications to affected employees.

### Attendance

**Clock-in** and **clock-out** records are created by staff via the mobile app. The service calculates hours worked from these records. Managers can query total hours per employee over a date range — this feeds directly into payroll preparation and the staff hours report.

### Tip Pools

A **tip pool** collects a total tip amount for a period (e.g. a shift or a day) and distributes it across eligible employees. Distribution is calculated based on hours worked during the period, weighted by role if configured. Once distributed, each employee's allocation is recorded.

### Tasks

**Tasks** are operational to-dos assigned to employees or a role group. Each task has a title, due date/time, and an optional checklist of steps. Staff mark tasks complete with a completion note. Managers can track outstanding, in-progress, and completed tasks across the restaurant.

### Shift Swaps

Staff can request to swap a shift with another employee. The swap goes through a manager approval step before it takes effect.

### Time Off

Staff can submit **time-off requests** with a date range and reason. Managers approve or reject requests. Approved time off is reflected in the scheduling view.

### Certifications and Training

The service tracks per-employee **certifications** (food safety, alcohol service, first aid, etc.) with issue and expiry dates. Approaching or expired certifications trigger alerts. **Training milestones** track progress through onboarding checklists for new staff members.

---

## API

All endpoints are prefixed with `/api/v1/staff`.

### Employees

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/employees` | `owner`, `manager` | Lists all employees (paginated). |
| `GET` | `/employees/:id` | `owner`, `manager` | Returns a single employee's full profile. |
| `POST` | `/employees` | `owner` | Creates a new employee record and optionally triggers an app invite. |
| `PUT` | `/employees/:id` | `owner`, `manager` | Updates an employee's HR details. |
| `DELETE` | `/employees/:id` | `owner` | Soft-deletes an employee record (marks as inactive). |

### Shifts

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/shifts` | All roles | Lists shifts. Managers see all; employees see only their own. Supports filtering by `date`, date range (`from`/`to`), and `employeeId`. |
| `GET` | `/shifts/:id` | All roles | Returns a single shift. |
| `POST` | `/shifts` | `owner`, `manager` | Creates a new shift in DRAFT status for a specific employee and time block. |
| `PATCH` | `/shifts/:id/status` | `owner`, `manager` | Updates the shift status (e.g. mark as COMPLETED or CANCELLED). |
| `POST` | `/shifts/publish` | `owner`, `manager` | Publishes all DRAFT shifts in a date range, making them visible to employees and triggering notifications. Accepts `from` and `to` query params. Returns the number of shifts published. |
| `DELETE` | `/shifts/:id` | `owner`, `manager` | Soft-deletes a DRAFT shift. |

### Shift Swaps

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/shift-swaps` | All roles | Lists pending and resolved swap requests. |
| `POST` | `/shift-swaps` | `kitchen_staff`, `server` | Requests a shift swap with another employee. |
| `POST` | `/shift-swaps/:id/approve` | `owner`, `manager` | Approves a swap request — the shifts are exchanged. |
| `POST` | `/shift-swaps/:id/reject` | `owner`, `manager` | Rejects a swap request. |

### Attendance

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/attendance` | `owner`, `manager` | Lists all attendance records for the tenant (paginated). |
| `GET` | `/attendance/employee/:id` | `owner`, `manager` | Lists attendance records for a specific employee. Filterable by date range. |
| `GET` | `/attendance/employee/:id/hours` | `owner`, `manager` | Returns total hours worked by an employee between `from` and `to` timestamps. |
| `POST` | `/attendance/clock-in` | All roles | Clocks an employee in. Requires an employee ID. Records timestamp automatically. |
| `POST` | `/attendance/clock-out/:employeeId` | All roles | Clocks an employee out. Calculates and stores hours worked since clock-in. |

### Tasks

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/tasks` | All roles | Lists tasks. Filterable by `status` (PENDING, IN_PROGRESS, COMPLETED). |
| `GET` | `/tasks/employee/:employeeId` | All roles | Lists tasks assigned to a specific employee, optionally filtered by status. |
| `GET` | `/tasks/:id` | All roles | Returns a single task with its steps and completion history. |
| `POST` | `/tasks` | `owner`, `manager`, `kitchen_staff` | Creates a new task and assigns it to an employee or role. |
| `PUT` | `/tasks/:id` | `owner`, `manager`, `kitchen_staff` | Updates a task's details, due date, or assignee. |
| `POST` | `/tasks/:id/complete` | All roles | Marks a task as completed with a completion note. |
| `PATCH` | `/tasks/:id/status` | `owner`, `manager`, `kitchen_staff` | Updates a task's status (e.g. move from PENDING to IN_PROGRESS). |
| `DELETE` | `/tasks/:id` | `owner`, `manager` | Soft-deletes a task. |

### Tip Pools

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/tip-pools` | All roles | Lists tip pool records (paginated, newest first). |
| `GET` | `/tip-pools/:id` | All roles | Returns a tip pool with the distribution breakdown per employee. |
| `POST` | `/tip-pools` | `owner`, `manager` | Creates a new tip pool for a period with a total tip amount and the set of participating employees. |
| `POST` | `/tip-pools/:id/distribute` | `owner`, `manager` | Calculates and records each employee's share based on hours worked during the period. Marks the pool as distributed. |

### Time Off

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/time-off` | `owner`, `manager` | Lists time-off requests. |
| `POST` | `/time-off` | All roles | Submits a time-off request for a date range with a reason. |
| `POST` | `/time-off/:id/approve` | `owner`, `manager` | Approves the request. |
| `POST` | `/time-off/:id/reject` | `owner`, `manager` | Rejects the request with an optional note. |

### Certifications

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/certifications` | `owner`, `manager` | Lists all employee certifications for the tenant. |
| `GET` | `/certifications/expiring` | `owner`, `manager` | Lists certifications expiring within the next 30 days. |
| `POST` | `/certifications` | `owner`, `manager` | Records a certification for an employee with issue and expiry dates. |
| `PUT` | `/certifications/:id` | `owner`, `manager` | Updates certification details (e.g. renewal). |

### Training Milestones

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/training-milestones/employee/:id` | `owner`, `manager` | Returns training progress for an employee. |
| `POST` | `/training-milestones` | `owner`, `manager` | Creates a training milestone for an employee. |
| `POST` | `/training-milestones/:id/complete` | `owner`, `manager` | Marks a milestone as achieved. |

---

## Events Published

| Event | Published When | Consumed By |
|---|---|---|
| `staff.shift.published` | A batch of shifts is published | Notification service (alerts employees their schedule is ready) |
| `staff.attendance.clocked_in` | An employee clocks in | Notification service (optional manager alert for late arrivals) |

---

## Getting Started

```bash
cd services/staff-service
mvn spring-boot:run
```

The service starts on port **8088**.

### Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `RABBITMQ_URL` | RabbitMQ connection string |
| `INTERNAL_SERVICE_SECRET` | Shared secret for internal service-to-service calls |
| `AUTH_SERVICE_URL` | Base URL for the Auth service (used to resolve user accounts for employees) |

---

## Health Check

```bash
curl http://localhost:8088/actuator/health
```

---

## Running Tests

```bash
mvn test
```

Integration tests use Testcontainers and require Docker to be running.

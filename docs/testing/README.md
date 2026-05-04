# KitchenLedger — Test Suite Index

> Two layers of testing: **epic files** (feature-by-feature) + **system integration** (full business scenarios crossing all services).  
> Run epics first to validate each feature in isolation, then run the system test to validate the glue.

---

## Layer 1 — Epic Tests (Feature Isolation)

Run in order — each epic builds on test data from the previous one.

| # | File | Epic | Test Cases | Services Covered |
|---|---|---|---|---|
| 1 | [EPIC-01-AUTH-MULTITENANCY.md](EPIC-01-AUTH-MULTITENANCY.md) | Auth & Multi-Tenancy | TC-AUTH-01 → TC-AUTH-93 | Gateway, Auth Service |
| 2 | [EPIC-02-INVENTORY.md](EPIC-02-INVENTORY.md) | Inventory Management | TC-INV-01 → TC-INV-121 | Inventory Service |
| 3 | [EPIC-03-FINANCE.md](EPIC-03-FINANCE.md) | Finance & Accounts | TC-FIN-01 → TC-FIN-83 | Finance Service |
| 4 | [EPIC-04-STAFF-HR.md](EPIC-04-STAFF-HR.md) | Staff & HR | TC-HR-01 → TC-HR-100 | Staff Service |
| 5 | [EPIC-05-AI-FEATURES.md](EPIC-05-AI-FEATURES.md) | AI Features | TC-AI-00 → TC-AI-83 | AI Service, File Service |
| 6 | [EPIC-06-NOTIFICATIONS-AUDIT.md](EPIC-06-NOTIFICATIONS-AUDIT.md) | Notifications & Audit | TC-NOTIFY-01 → TC-AUDIT-29 | Notification Service, all services |
| 7 | [EPIC-07-TRACEABILITY-AND-NFR.md](EPIC-07-TRACEABILITY-AND-NFR.md) | Traceability + NFR | TC-TRACE-01 → TC-NFR-83 | All services |

## Layer 2 — System Integration Tests (Full Business Scenarios)

Run after all epics pass. Tests the system as a restaurant, not as individual services.

| # | File | Scenarios | What It Validates |
|---|---|---|---|
| 8 | [SYSTEM-INTEGRATION-TEST.md](SYSTEM-INTEGRATION-TEST.md) | SIT-01 → SIT-12 | Cross-service event chains, offline sync, multi-tenant isolation, purchase-to-plate, full operating day |

**Master E2E plan (overview):** [../E2E_TEST_PLAN.md](../E2E_TEST_PLAN.md)

---

## Known Gaps — Expected Failures (Do Not Raise as Bugs)

### Phase 1 Features Not Yet Implemented

These are Phase 1 PRD requirements that the codebase audit confirmed as missing. Treat test cases for these as **TODO** items, not bugs in the test suite:

| Feature | PRD Section | Gap | Affected Test Cases |
|---|---|---|---|
| **Geofencing clock-in** | 3.3 Attendance | No GPS validation provider integrated | TC-HR-30 (geofence violation), SIT-02 clock-in |
| **FLSA overtime calculation** | 3.3 Staff | No 40h/week → 1.5× pay logic | TC-HR-52, TC-HR-53, SIT-12 payroll |
| **WhatsApp/SMS notifications** | 3.5 Cross-cutting | Only Expo push + Resend email implemented | TC-NOTIFY-40, TC-AI-any WhatsApp ref |

### Partially Implemented (Behavior May Differ from Test Expectations)

| Feature | Status | What to Expect |
|---|---|---|
| Weekly notification digest | Event consumer exists; generation logic unclear | TC-NOTIFY-30 → verify digest content partially |
| AvT dedicated endpoint | Variance exists in DSR service, no `/avt` route | TC-INV-90 → may need to read from DSR response |
| Task photo verification | Controller exists; photo workflow details unclear | TC-HR-42 → verify what fields are returned |

### Phase 2/3 — Not Built Yet

The following PRD sections are excluded entirely. Do not test for these:

| Module | PRD Section | Phase |
|---|---|---|
| Front of House (FOH) guest lifecycle | 3.4 #1 | Phase 2 |
| Bar & Beverage (pour cost %, spirit inventory) | 3.4 #8 | Phase 2 |
| Maintenance & Engineering | 3.4 #7 | Phase 2 |
| Quality Control / HACCP | 3.4 #12 | Phase 2 |
| Marketing & Loyalty / CRM | 3.4 #4 | Phase 3 |
| Multi-location / Commissary | 3.4 #13 | Phase 3 |
| QuickBooks/Xero export | 3.2 | Phase 2 |
| LSTM demand forecasting | 4.3 | Phase 3 |

---

## Pre-Flight Checklist (Before Any Testing)

```bash
# 1. Start infrastructure
npm run infra:up

# 2. Start all services
npm run dev

# 3. Verify all 9 services healthy
curl http://localhost:8080/health          # Gateway
curl http://localhost:8081/actuator/health # Auth
curl http://localhost:8082/actuator/health # Inventory
curl http://localhost:8083/actuator/health # Finance
curl http://localhost:8084/health          # AI
curl http://localhost:8085/health          # File
curl http://localhost:8086/health          # Notification
curl http://localhost:8087/health          # Report
curl http://localhost:8088/actuator/health # Staff

# 4. Verify DB migrations applied
psql $DATABASE_URL -c "\dt" | grep -c "inventory_items"

# 5. Verify RabbitMQ queues created
curl -u guest:guest http://localhost:15672/api/queues | jq '.[].name'
```

---

## Shared Test Personas

| Persona | Role | Email |
|---|---|---|
| Priya | Owner | priya@dosapalace.com |
| Ravi | Manager | ravi@dosapalace.com |
| Anita | Kitchen Staff | anita@dosapalace.com |

**Restaurant:** Dosa Palace, Bangalore, India — `INR`, `Asia/Kolkata`

---

## MANDATORY Tests — Minimum Bar for Any Release

These must pass before any production deployment:

**Auth:** TC-AUTH-01, TC-AUTH-11, TC-AUTH-21, TC-AUTH-22, TC-AUTH-28, TC-AUTH-31, TC-AUTH-32, TC-AUTH-40 (full RBAC), TC-AUTH-51, TC-AUTH-55, TC-AUTH-60, TC-AUTH-71

**Inventory:** TC-INV-01, TC-INV-10, TC-INV-31, TC-INV-40, TC-INV-50, TC-INV-53, TC-INV-62, TC-INV-70, TC-INV-80, TC-INV-90

**Finance:** TC-FIN-01, TC-FIN-03, TC-FIN-09, TC-FIN-26, TC-FIN-28, TC-FIN-43, TC-FIN-50, TC-FIN-51, TC-FIN-52, TC-FIN-53, TC-FIN-80

**Staff:** TC-HR-01, TC-HR-20, TC-HR-23, TC-HR-24, TC-HR-30, TC-HR-32, TC-HR-34, TC-HR-42, TC-HR-52, TC-HR-53, TC-HR-56, TC-HR-60, TC-HR-70, TC-HR-71

**AI:** TC-AI-00, TC-AI-01, TC-AI-09, TC-AI-20, TC-AI-26, TC-AI-30, TC-AI-40, TC-AI-48, TC-AI-49, TC-AI-80, TC-AI-81

**Notifications:** TC-NOTIFY-01, TC-NOTIFY-03, TC-NOTIFY-09, TC-NOTIFY-11, TC-NOTIFY-14, TC-NOTIFY-16, TC-NOTIFY-30, TC-NOTIFY-40

**Audit:** TC-AUDIT-01→TC-AUDIT-17 (all events), TC-AUDIT-18, TC-AUDIT-20, TC-AUDIT-22, TC-AUDIT-24

**Traceability:** TC-TRACE-01, TC-TRACE-02, TC-TRACE-08

**NFR:** TC-NFR-02, TC-NFR-10, TC-NFR-13, TC-NFR-14, TC-NFR-20, TC-NFR-23, TC-NFR-25, TC-NFR-26, TC-NFR-27, TC-NFR-40, TC-NFR-42, TC-NFR-43, TC-NFR-60, TC-NFR-71

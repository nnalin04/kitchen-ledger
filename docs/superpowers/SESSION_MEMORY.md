# KitchenLedger — Session Memory
> Auto-maintained. On any interruption, paste this file into a new chat with "resume from SESSION_MEMORY.md".

---

## How to Resume a Interrupted Session

1. Open a new Claude Code chat in this project directory
2. Say: **"Resume from SESSION_MEMORY.md"**
3. Claude will read this file and pick up exactly where we left off

---

## Project One-Liner

KitchenLedger — all-in-one restaurant management SaaS (Inventory + Finance + Staff). Monorepo: Next.js 14 web, Expo mobile, 9 microservices (Java Spring Boot 4 + Python FastAPI + Node Fastify). Single Supabase/PostgreSQL DB with RLS on every table.

---

## Last Updated

**Date:** 2026-04-25  
**Session goal:** FIN epic COMPLETE ✅ — pick next epic to build end-to-end

## Current Task: FIN Epic — Confirmed Gaps (resume here)

### What EXISTS in finance-service:
Models: Account, DailySalesReport, Expense, Vendor, VendorPayment
Repos: AccountRepository, DailySalesReportRepository, ExpenseRepository, VendorRepository, VendorPaymentRepository
Services: AccountService, DailySalesReportService, ExpenseService, VendorService, VendorPaymentService
Controllers: AccountController, DailySalesReportController, ExpenseController, VendorController, VendorPaymentController, InternalFinanceController, HealthController
Jobs: OverduePaymentJob (handles VendorPayments, NOT expense status), OutboxReplayJob
Events: FinanceEventListener (partial), FinanceEventPublisher
Migrations: V1–V10
Tests: multiple unit+IT tests exist

### What is MISSING (build these):
**Backend:**
- PLReportService.java + report endpoints (GET /api/finance/reports/pl, /expenses, /cash-flow, /tax)
- AccountsPayableService.java + AP endpoints (GET /api/finance/ap/summary, /ap/aging)
- UpiTransaction model + UpiTransactionRepository + V11 migration
- UpiService.java + UpiController.java (POST /api/finance/upi/generate-qr, POST /api/webhooks/upi-payment)
- FinanceScheduledJobs.java — checkPaymentDueAlerts (8am daily), sendWeeklyFinanceSummary (Mon 9am)
- markOverduePayments on EXPENSES (OverduePaymentJob only handles VendorPayments currently)
- Repository methods: DailySalesReportRepository.aggregateRevenueSummary(), DailySalesReportRepository.findTrendData()
- Repository methods: ExpenseRepository.sumByAccountType(), findByTenantIdAndDueDateBetween()
- DTOs: PLReportResponse, APAgingResponse, DashboardKpiResponse, UpiTransactionResponse
- GET /api/finance/dashboard endpoint (missing from DailySalesReportController)
- /internal/finance/pl-data endpoint (for Report Service)
- FinanceEventListener.onOcrCompleted() — update expense fields from OCR result

**Tests:**
- PLReportServiceTest.java, APServiceTest.java, UpiServiceTest.java
- FinanceScheduledJobsTest.java
- PLReportControllerIT.java, APControllerIT.java, UpiControllerIT.java

**Web:**
- apps/web/components/finance/UPIQRModal.tsx
- apps/web/hooks/use-realtime.ts (Supabase Realtime for DSR live updates)
- finance.api.ts missing methods: reports.getPL, ap.getSummary, ap.getAgingDetail, upi.generateQr

---

## Completed Work (do NOT redo)

### Backend Fixes — ALL DONE ✅
All 23 items in `docs/BACKEND_FIXES.md` are marked `[x]`. Backend is complete.

### Web App — WEB-1 through WEB-7 ✅
| Task | Status | Notes |
|------|--------|-------|
| WEB-1 | ✅ Done | Bootstrap, auth store, layout, shadcn/ui |
| WEB-2 | ✅ Done | Auth pages (login, register, forgot-password, setup wizard) |
| WEB-3 | ✅ Done | Home dashboard, KPI cards, alerts |
| WEB-4 | ✅ Done | Inventory items, categories |
| WEB-5 | ✅ Done | Inventory suppliers, purchase orders |
| WEB-6 | ✅ Done | Inventory receiving, counts, waste |
| WEB-7 | ✅ Done | Inventory recipes, menu engineering |

### Partial WEB-8 (Finance)
| File | Status |
|------|--------|
| `apps/web/app/(dashboard)/finance/page.tsx` | ✅ Done |
| `apps/web/app/(dashboard)/finance/daily-reports/[date]/page.tsx` | ✅ Done |
| `apps/web/lib/api/finance.api.ts` | ✅ Done |
| `apps/web/lib/api/staff.api.ts` | ✅ Done |

### Partial WEB-11 (Staff)
| File | Status |
|------|--------|
| `apps/web/app/(dashboard)/staff/page.tsx` | ✅ Done |
| `apps/web/app/(dashboard)/staff/schedule/page.tsx` | ✅ Done |
| `apps/web/app/(dashboard)/staff/employees/page.tsx` | ✅ Done |

---

## All Pages — Built ✅ (need UI polish pass)

| Page | Built | Motion | 21st.dev | ui-ux-pro-max |
|------|-------|--------|----------|---------------|
| finance/daily-reports/page.tsx | ✅ | ❌ | ❌ | ❌ |
| finance/expenses/page.tsx | ✅ | ❌ | ❌ | ❌ |
| finance/vendors/page.tsx | ✅ | ❌ | ❌ | ❌ |
| finance/accounts-payable/page.tsx | ✅ | ❌ | ❌ | ❌ |
| finance/reports/page.tsx | ✅ | ❌ | ❌ | ❌ |
| staff/employees/[id]/page.tsx | ✅ | ❌ | ❌ | ❌ |
| staff/attendance/page.tsx | ✅ | ❌ | ❌ | ❌ |
| staff/tasks/page.tsx | ✅ | ❌ | ❌ | ❌ |
| staff/tips/page.tsx | ✅ | ❌ | ❌ | ❌ |
| ai/notebook-scan/page.tsx | ✅ | ❌ | ❌ | ❌ |
| ai/query/page.tsx | ✅ | ❌ | ❌ | ❌ |
| settings/page.tsx | ✅ | ❌ | ❌ | ❌ |
| settings/team/page.tsx | ✅ | ❌ | ❌ | ❌ |
| settings/operations/page.tsx | ✅ | ❌ | ❌ | ❌ |
| settings/accounts/page.tsx | ✅ | ❌ | ❌ | ❌ |

## Remaining Work (pick up here)

### UI Polish Pass — ALL 15 pages above need:
1. **motion/react** — `AnimatePresence` + `motion.div` on page entry (fadeInUp), list items (staggered), sheet/dialog open/close
2. **21st.dev** — check each component type against https://21st.dev/community/components; replace or align DataTable, filter bars, stat cards, form sheets if better patterns exist
3. **ui-ux-pro-max** — run `/ui-ux-pro-max` skill to validate palette, typography, chart choices

### NL items (low priority backend, do last)
- [ ] NL-1 — Currency hardcoded `"INR"` in event payloads
- [ ] NL-2 — NoShowDetectionJob unbounded query
- [ ] NL-3 — OverduePaymentJob / ExpiryCheckJob abort on single-tenant failure
- [ ] NL-4 — RabbitMQ reconnect flat delay → exponential backoff
- [ ] NL-5 — Raw invite token in RabbitMQ payload

---

## Key Architecture Facts

- **Web stack:** Next.js 14 App Router, TypeScript strict, Tailwind, shadcn/ui, SWR, Zustand, react-hook-form + zod
- **API client:** `apps/web/lib/api/client.ts` — Axios with auth interceptors; use `apiClient.get/post/patch/delete`
- **API methods:** `apps/web/lib/api/finance.api.ts`, `staff.api.ts`, `inventory.api.ts` — always use these, never raw fetch
- **Auth store:** `apps/web/stores/auth.store.ts` — `useAuthStore()` for `user`, `tenant`, `accessToken`
- **Shared components:** `apps/web/components/shared/` — DataTable, KPICard, DateRangePicker, ConfirmDialog, FileUploadZone, BenchmarkBadge
- **Layout components:** `apps/web/components/layout/` — Sidebar, Topbar, RoleGuard
- **shadcn/ui components:** `apps/web/components/ui/` — button, card, badge, dialog, sheet, input, label, select, tabs, separator, skeleton
- **Charts:** `recharts` — use for all charts
- **Animations:** `motion/react` — use for all transitions/enter/exit
- **Conventions:** Server Components by default; `'use client'` only for interactive parts; no inline styles; Tailwind only

---

## Execution Plan for Remaining Work

Run parallel agents covering:
1. **Finance agent** → WEB-8 remaining + WEB-9 + WEB-10
2. **Staff agent** → WEB-11 remaining + WEB-12
3. **AI + Settings agent** → WEB-13 + WEB-14

---

## Epic Completion Status (last audited 2026-04-21)

| Epic | % Done | Biggest Gap |
|------|--------|-------------|
| AUTH | ✅ 100% | — |
| GW (Gateway) | ✅ 100% | Complete 2026-04-25 |
| FILE | ✅ 100% | Complete 2026-04-25 |
| INV | ✅ 100% | Complete 2026-04-25 |
| STAFF | ✅ 100% | Complete 2026-04-25 |
| FIN | ✅ 100% | Complete 2026-04-25 |
| NOTIF | ✅ 100% | Complete 2026-04-25 | Expo push provider, Resend provider, 4 email templates |
| PKG | ✅ 100% | Complete 2026-04-25 |
| INFRA | ✅ 100% | Complete 2026-04-25 |
| REPORT | 30% | All 6 generator classes, Celery task, Supabase storage |
| WEB | 35% | 16+ components missing (ItemEditDrawer, DSRWizard, OCR UI…) |
| AI | 20% | Essentially all service classes, routers, Celery, clients |
| DEPLOY | 20% | GCP setup, Cloud Run, monitoring, DNS |
| MOB | 10% | Entire app not built (14+ screens, WatermelonDB, sync) |
| TEST | 5% | No E2E, contract, performance, or security tests |

**Overall: ~55% complete**

## Low-Priority Items (not yet started)
- Low-priority backend fixes: NL-1 through NL-5 in `docs/BACKEND_FIXES.md`
- Mobile app (Expo) — `apps/mobile/` — not yet started
- E2E tests
- Deployment setup

# EPIC: WEB — Next.js Web Application

**Phase:** 4 | **Weeks:** 10–18 (parallel to Phase 2/3)
**App:** `apps/web` (Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui)
**Goal:** Full management dashboard covering all three core modules (Inventory, Finance, Staff), AI features, settings, onboarding wizard.
**Depends on:** All backend services running (can develop against mock data initially)
**Blocks:** Nothing (final user-facing layer)

---

## WEB-1: Project Setup & Design System

- [ ] Initialize Next.js 14 with App Router, TypeScript strict mode, Tailwind CSS
- [ ] `npx shadcn@latest init` — neutral theme, CSS variables, Tailwind config
- [ ] Install: `axios`, `zustand`, `@supabase/supabase-js`, `recharts`, `react-hook-form`, `zod`, `@tanstack/react-query`, `date-fns`
- [ ] `lib/api/client.ts` — Axios instance:
  - `baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'`
  - Request interceptor: inject `Authorization: Bearer {accessToken}` from Zustand store
  - Response interceptor: on 401 → refresh token → retry; on second 401 → logout + redirect `/login`
- [ ] `stores/auth.store.ts` — Zustand with localStorage persistence:
  - State: `{ user, tenant, accessToken, refreshToken, isLoading }`
  - Actions: `login(email, password)`, `logout()`, `refreshToken()`, `updateTenant(settings)`
- [ ] `stores/ui.store.ts` — `{ sidebarOpen, theme }` (no persistence)
- [ ] `components/layout/Sidebar.tsx` — responsive sidebar with nav links for all modules; shows active route
- [ ] `components/layout/Topbar.tsx` — breadcrumb + notification bell (unread count badge) + user avatar menu (profile/logout)
- [ ] `components/layout/RoleGuard.tsx` (exact from TRD §5.1) — wraps children, checks `user.role` against `allowedRoles`
- [ ] Shared components:
  - `components/shared/DataTable.tsx` — generic paginated sortable table; accepts `columns` + `data` + `pagination` props
  - `components/shared/KPICard.tsx` — metric name, value, % change, trend arrow, color from `benchmarkStatus`
  - `components/shared/DateRangePicker.tsx` — calendar popover for start/end date selection
  - `components/shared/ConfirmDialog.tsx` — destructive action confirmation modal
  - `components/shared/FileUploadZone.tsx` — drag-drop + click-to-browse; calls File Service presign endpoint
  - `components/shared/BenchmarkBadge.tsx` — green/yellow/red pill based on status enum
- [ ] `app/(auth)/layout.tsx` — no sidebar; centered card layout
- [ ] `app/(dashboard)/layout.tsx` — sidebar + topbar; auth guard: if no `accessToken` in store → `redirect('/login')`
- [ ] **Test:** Navigate to `/` unauthenticated → redirected to `/login`. Login → redirected to `/dashboard`.

---

## WEB-2: Auth Pages

- [ ] `app/(auth)/login/page.tsx`:
  - Email + password form (react-hook-form + zod validation)
  - Call `authStore.login()` → on success redirect to `/`
  - Show field errors from API (wrong password, not verified, etc.)
  - Link to forgot-password
- [ ] `app/(auth)/register/page.tsx`:
  - Restaurant name + owner email + password + confirm password
  - Submit → `POST /api/auth/register` → redirect to `/setup`
- [ ] `app/(auth)/forgot-password/page.tsx` — email form → success state shows "check your inbox"
- [ ] `app/(auth)/setup/page.tsx` — 5-step onboarding wizard (step shown in URL param or state):
  1. **Restaurant Details** — name, type (café/full-service/QSR/food truck), timezone, currency
  2. **Operating Hours** — open/close times per day of week
  3. **Menu Upload** — drag-drop menu PDF or "skip, use template" with type presets
  4. **Invite Staff** — email + role for first team member (can skip)
  5. **First Action** — two CTA buttons: "Log today's sales" or "Do a quick stock count"
  - Saves via `PATCH /api/auth/tenant/settings` + `PATCH /api/auth/tenant/profile`
  - On final step complete: set `tenant.onboarding_done = true`

---

## WEB-3: Home Dashboard

- [ ] `app/(dashboard)/page.tsx` — "10-minute morning review":
  - Top row KPI cards (yesterday vs. same day last week): Net Sales, Cash Over/Short, Guest Count, Avg Check Size
  - Second row: Food Cost %, Labor Cost %, SPLH, Table Turnover Rate — each with BenchmarkBadge
  - Low Stock alerts widget — list of items at/below PAR with "Create PO" quick action
  - Expiring items widget — perishables expiring today/tomorrow
  - Incomplete critical tasks widget — tasks with `requires_photo=true` and status=pending
  - Notification badge in topbar showing unread count (Supabase Realtime via `hooks/use-realtime.ts`)
- [ ] `hooks/use-realtime.ts` — Supabase Realtime subscription (exact from TRD §5.1):
  - Subscribe to `daily_sales_reports` UPDATE for tenant → call SWR mutate to refresh KPIs
  - Subscribe to `notifications` INSERT for user → increment unread count badge
- [ ] **Test:** Dashboard renders with mock data. Real-time badge increments when notification inserted.

---

## WEB-4: Inventory — Items & Categories

- [ ] `lib/api/inventory.api.ts` — all inventory API methods (exact from TRD §5.1 pattern)
- [ ] `app/(dashboard)/inventory/page.tsx`:
  - `DataTable` with columns: Name, ABC Category badge, Current Stock vs PAR level, Storage Location, Avg Cost, Actions
  - Search box (debounced), ABC filter tabs (All / A / B / C), Low Stock toggle
  - "Add Item" button → `ItemEditDrawer` (sheet)
  - Bulk import CSV button → file upload → `POST /api/inventory/items/import`
- [ ] `components/inventory/ItemEditDrawer.tsx` — create/edit form:
  - Tabs: Basic Info | Units & Cost | Stock Settings | Suppliers
  - Basic: name, category (select), ABC category (A/B/C with override flag), storage location, barcode, is_perishable, shelf_life_days
  - Units: purchase_unit, recipe_unit, count_unit, conversion factors, purchase_unit_qty
  - Stock: par_level, safety_stock, reorder_quantity, expiry_alert_days
  - Suppliers: table of linked suppliers with price; add supplier row; mark preferred
- [ ] `app/(dashboard)/inventory/items/[id]/page.tsx` — item detail:
  - Header: item name + ABC badge + low-stock warning if applicable
  - Current stock meter (bar showing actual vs. PAR)
  - Stock movement history chart (Recharts line chart, last 30 days)
  - Supplier pricing table
  - Recipes using this item (list with food_cost_% for each)
  - Movement log (DataTable)
- [ ] `app/(dashboard)/inventory/categories/page.tsx` — category tree (nested list), create/rename/delete
- [ ] **Test:** Create item via drawer → appears in table. Filter A-category → only A items. Item detail shows movement chart.

---

## WEB-5: Inventory — Suppliers & Purchase Orders

- [ ] `app/(dashboard)/inventory/suppliers/page.tsx` — supplier list DataTable; create/edit via drawer with all contact fields
- [ ] `app/(dashboard)/inventory/purchase-orders/page.tsx`:
  - DataTable with status filter tabs (Draft / Sent / Received)
  - Auto-suggested POs section at top if any items below PAR
  - "Create PO" button
- [ ] `app/(dashboard)/inventory/purchase-orders/new/page.tsx`:
  - Select supplier (searchable dropdown)
  - Add items: search item → enter ordered quantity + unit price
  - Live subtotal + tax + total calculation
  - Notes field
  - "Save Draft" and "Send Now" (email / WhatsApp) buttons
  - Suggested items pre-populated from low-stock alerts if coming from suggestion

---

## WEB-6: Inventory — Receiving, Counts & Waste

- [ ] `app/(dashboard)/inventory/receipts/page.tsx` — list of receipts with three-way match status badges
- [ ] `app/(dashboard)/inventory/receipts/new/page.tsx` — `components/inventory/ReceiptForm.tsx`:
  - Select existing PO (optional) → pre-populates expected quantities
  - Enter actual received quantity + actual unit price per line item
  - Three-way match indicator per line (MATCHED / DISCREPANCY shown inline)
  - Invoice number + date + invoice photo upload (FileUploadZone)
  - "Confirm Receipt" → `POST /api/inventory/receipts/{id}/confirm`
- [ ] `app/(dashboard)/inventory/counts/page.tsx` — count sessions list with status badges
- [ ] `app/(dashboard)/inventory/counts/[id]/page.tsx` — `components/inventory/StockCountSession.tsx`:
  - Grouped by storage location (walk-in, dry storage, freezer, bar)
  - Each row: item name, expected qty, counted qty input, variance (real-time = counted - expected)
  - Auto-save on blur (debounced `PATCH` per item)
  - Progress bar: X of N items counted
  - "Complete Count" button → navigates to variance report
  - "Verify & Apply" button [owner/manager] → applies adjustments
- [ ] `app/(dashboard)/inventory/waste/page.tsx`:
  - `components/inventory/WasteLogForm.tsx` inline at top (quick log)
  - Date filter + reason filter
  - Waste trend chart (Recharts bar chart grouped by reason, last 7 days)
  - DataTable of waste entries with photo thumbnails

---

## WEB-7: Inventory — Recipes & Menu Engineering

- [ ] `app/(dashboard)/inventory/recipes/page.tsx`:
  - Grid of recipe cards: name, food_cost_% with BenchmarkBadge (< 30% green, 30-35% yellow, > 35% red), menu_matrix_category badge
  - "Add Recipe" → `RecipeEditor` drawer
- [ ] `components/inventory/RecipeEditor.tsx`:
  - Name, category, menu_price, serving size, prep/cook time
  - Ingredients table: search ingredient (live autocomplete) → enter quantity + unit + waste %
  - Sub-recipe support: dropdown to link sub-recipes
  - Live cost preview: updates total_cost + food_cost_% as ingredients added
  - Yield percent field
  - "Calculate Cost" button → `POST /api/inventory/recipes/{id}/calculate-cost`
- [ ] `app/(dashboard)/inventory/menu-engineering/page.tsx`:
  - 2×2 BCG matrix: Recharts ScatterChart with 4 quadrants
  - X-axis: popularity (1-5 manual input for MVP)
  - Y-axis: profitability (inverted food_cost_%)
  - Quadrant labels: ⭐ Star (top-right), 🐄 Plowhorse (bottom-right), ❓ Puzzle (top-left), 🐕 Dog (bottom-left)
  - Each dot = recipe; click → drawer with edit options + quick actions (price it up / remove from menu)

---

## WEB-8: Finance — DSR & Dashboard

- [ ] `lib/api/finance.api.ts` — all finance API methods
- [ ] `app/(dashboard)/finance/page.tsx` — finance KPI dashboard:
  - Last 7 days sparkline charts: revenue, food cost %, labor cost %
  - Outstanding AP total + overdue count
  - Pending reconciliations count
- [ ] `app/(dashboard)/finance/daily-reports/page.tsx` — list of reports with reconciliation status calendar view (each day = colored square: draft/reconciled/missing)
- [ ] `app/(dashboard)/finance/daily-reports/[date]/page.tsx` — `components/finance/DSRWizard.tsx`:
  - **Step 1: Sales Entry** — gross_sales, split into food/beverage/other, comps, voids, discounts
  - **Step 2: Payment Breakdown** — cash, card, UPI/digital wallet, delivery platforms; must sum to net_sales (show error if not)
  - **Step 3: Cash Count** — enter `cash_counted`; instant over/short calculation; if |over_short| > threshold → explanation field required
  - **Step 4: Review & Reconcile** — summary card with all data; "Reconcile" button; success state shows checkmark
  - Form state persisted in URL params (user can refresh without losing progress)
- [ ] `components/finance/UPIQRModal.tsx` — enter amount → call generate-qr endpoint → show QR image → "Mark Paid Manually" fallback button

---

## WEB-9: Finance — Expenses & Vendors

- [ ] `app/(dashboard)/finance/expenses/page.tsx`:
  - Filter bar: date range, account, vendor, status (paid/pending/overdue)
  - `DataTable` with columns: Date, Description, Vendor, Account, Amount, Status badge, Receipt thumbnail
  - "Add Expense" → `ExpenseForm` sheet
  - Bulk import from receipt scan button
- [ ] `components/finance/ExpenseForm.tsx`:
  - Date, description, amount, tax amount, payment method, status, due date
  - Account selector (searchable, shows account code + name)
  - Vendor selector (searchable, create-inline option)
  - Receipt upload (FileUploadZone) → on file selected, trigger `POST /api/ai/ocr/receipt` → auto-fill fields from OCR result (edit before save)
- [ ] `app/(dashboard)/finance/vendors/page.tsx` — vendor list + CRUD drawer
- [ ] `app/(dashboard)/finance/accounts-payable/page.tsx`:
  - `components/finance/APAgingTable.tsx` — per-vendor rows with 4 aging bucket columns
  - "Record Payment" inline action per row → opens mini payment form
  - Total row at bottom

---

## WEB-10: Finance — P&L Report

- [ ] `app/(dashboard)/finance/reports/page.tsx`:
  - Date range picker (presets: this month, last month, last 3 months, custom)
  - Optional comparison period toggle
  - `components/finance/PLReport.tsx` — inline P&L display:
    - 5 section cards: Revenue, COGS, Gross Profit, Labor, Operating, Net Profit
    - Each section: line items with amount + % of net sales
    - Benchmark comparison: `BenchmarkBadge` on food cost %, labor %, prime cost, net profit
    - Comparison column (if period selected): prior period amounts + % change arrows
  - "Export PDF" button → `POST /api/reports/jobs` with `report_type=pl_custom` → poll with progress spinner → download when ready
  - `GET /api/finance/reports/cash-flow` chart — 30-day projected cash flow (Recharts area chart)

---

## WEB-11: Staff — Schedule Builder

- [ ] `lib/api/staff.api.ts` — all staff API methods
- [ ] `app/(dashboard)/staff/schedule/page.tsx`:
  - Week navigation (prev/next week)
  - Grid: rows = employees, columns = 7 days
  - Each cell: show shift card (start-end time, role, station); click → edit drawer; empty cell → click to create
  - Labor cost % of projected revenue shown in topbar (live as shifts created)
  - "Publish Schedule" button → `POST /api/staff/schedule/publish` → confirmation dialog
- [ ] `app/(dashboard)/staff/employees/page.tsx` — employee list DataTable; create/edit via drawer
- [ ] `app/(dashboard)/staff/employees/[id]/page.tsx`:
  - Tabs: Overview | Shifts | Attendance | Goals | Certifications
  - Overview: role, hire date, hourly rate, emergency contact, availability
  - Shifts: last 4 weeks of shifts
  - Attendance: weekly hours summary chart
  - Goals: performance goal list with progress bars
  - Certifications: list with expiry dates; expired = red badge

---

## WEB-12: Staff — Attendance, Tasks & Tips

- [ ] `app/(dashboard)/staff/attendance/page.tsx`:
  - Week date picker
  - Employee × day matrix showing hours + status (late/absent/present)
  - Overtime flags (orange highlight if > 8h day)
  - "Approve Timesheet" bulk action
  - Download CSV button
- [ ] `app/(dashboard)/staff/tasks/page.tsx`:
  - Date filter + category filter tabs (All / Opening / Closing / Prep / Safety)
  - Checklist grouped by category: each row = task, assigned employee, due time, status, photo thumbnail if completed
  - "Add Task" button → form drawer (title, category, assign to, due_date, requires_photo toggle)
  - Overdue tasks highlighted in red
- [ ] `app/(dashboard)/staff/tips/page.tsx`:
  - Date + shift type filter
  - "Create Tip Pool" → form: total_tips, distribution_rules (BY_HOURS / BY_ROLE / BY_POINTS) with rule editor
  - After calculate: per-employee payout table with basis explanation
  - "Distribute" button → confirmation → status=DISTRIBUTED

---

## WEB-13: AI Features

- [ ] `app/(dashboard)/ai/notebook-scan/page.tsx`:
  - `components/ai/NotebookScanner.tsx` — FileUploadZone accepting images; "context" toggle (Inventory / Expense)
  - On upload: file → File Service → get URL → `POST /api/ai/ocr/notebook` → poll job status with progress bar
  - `components/ai/OCRConfirmationUI.tsx`:
    - **Matched items** table: extracted name (→ matched item name), quantity, unit; editable fields; ✓ checkbox per row to include/exclude
    - **Unmatched items** table: raw extracted text + dropdown to match to existing item or "Create New"
    - Confidence score badge (green/yellow/red)
    - "Commit" button → `POST /api/ai/ocr/notebook/{id}/commit` with selected items
    - Success: shows count of items updated/created
- [ ] `app/(dashboard)/ai/query/page.tsx`:
  - `components/ai/QueryBar.tsx` — full-width search input; submit on Enter or button
  - Answer displayed as formatted text below
  - If `data.type == "line"` → Recharts LineChart; if `data.type == "bar"` → BarChart; if `data.type == "table"` → DataTable
  - Session query history (last 5 questions in sidebar)
  - Example prompts shown when empty: "How much did we spend on vegetables this week?", "What's my food cost % for this month?"

---

## WEB-14: Settings Pages

- [ ] `app/(dashboard)/settings/page.tsx` — personal profile: full name, email (read-only), phone, language selector, avatar upload, change password form
- [ ] `app/(dashboard)/settings/team/page.tsx` — user management (owner only):
  - Active users list with role badges
  - "Invite User" → email + role form → `POST /api/auth/users/invite`
  - Deactivate user toggle + change role dropdown
- [ ] `app/(dashboard)/settings/operations/page.tsx` — restaurant settings:
  - Timezone, currency, locale
  - Cash variance threshold (₹ / $)
  - Food cost target %, labor cost target %, prime cost target %
  - UPI ID field (enable/disable toggle)
  - Expiry alert days
  - Fiscal year start
- [ ] `app/(dashboard)/settings/accounts/page.tsx` — chart of accounts (owner only):
  - Tree view (hierarchical): parent account → child accounts
  - Inline add account button per section
  - Cannot delete is_system accounts (lock icon shown)

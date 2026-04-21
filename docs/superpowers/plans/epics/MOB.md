# EPIC: MOB — Expo Mobile Application

**Phase:** 4 | **Weeks:** 10–18 (parallel to Phase 2/3)
**App:** `apps/mobile` (Expo SDK 51 + React Native + TypeScript + Expo Router + WatermelonDB)
**Goal:** Offline-first mobile app for field operations. Primary use: waste logging, stock counting, receiving deliveries, clocking in/out, daily sales entry. Works without connectivity; syncs in background.
**Depends on:** All backend services, File Service (photo uploads), WatermelonDB (offline-first)
**Blocks:** Nothing (final user-facing layer)

---

## MOB-1: Project Setup & Offline Architecture

- [ ] Initialize Expo SDK 51 project with TypeScript, Expo Router, and all required native modules:
  - `expo-camera`, `expo-barcode-scanner`, `expo-location` (geofencing), `expo-secure-store`, `expo-av` (audio recording), `expo-notifications`
  - `@nozbe/watermelondb`, `@nozbe/watermelondb/adapters/sqlite`
  - `@supabase/supabase-js`, `axios`, `zustand`
- [ ] `lib/watermelon/schema.ts` — WatermelonDB schema (exact from TRD §5.2):
  - `inventory_items` table: server_id, tenant_id, name, category, abc_category, current_stock, par_level, count_unit, storage_location, is_perishable, avg_cost, synced_at
  - `waste_logs_pending` table: inventory_item_id, quantity, unit, reason, station, photo_url, notes, logged_at, synced
  - `count_session_items` table: count_session_id, inventory_item_id, server_count_item_id, counted_quantity, unit, synced
- [ ] Create WatermelonDB model classes for each table with `@field`, `@text`, `@readonly`, `@date` decorators
- [ ] `lib/watermelon/database.ts` — initialize DB with schema, SQLite adapter
- [ ] `lib/watermelon/sync.ts` — `synchronize()` function (exact from TRD §5.2):
  - `pullChanges({ lastPulledAt })` → GET `/api/inventory/sync/pull?last_pulled_at={ts}`
  - `pushChanges({ changes })`:
    - Push `waste_logs_pending.created` → POST `/api/inventory/waste` per log → mark synced=true
    - Push `count_session_items.updated` → PATCH `/api/inventory/counts/{session_id}/items/{item_id}` per item
- [ ] `lib/watermelon/sync.ts` — `startSyncScheduler()`:
  - `AppState` listener: sync on foreground
  - `setInterval` every 5 minutes when connectivity available
- [ ] `components/shared/OfflineBanner.tsx` — yellow banner when `NetInfo.isConnected = false`
- [ ] **Test:** Go offline → log waste → WatermelonDB `waste_logs_pending` row created → go online → sync → row marked synced → server has waste log.

---

## MOB-2: Auth Flow & Secure Token Storage

- [ ] `lib/storage.ts` — Expo SecureStore wrapper: `storeTokens(access, refresh)`, `getTokens()`, `clearTokens()`
- [ ] `stores/auth.store.ts` — Zustand (same shape as web): `{ user, tenant, accessToken }`, `login()`, `logout()`, `refreshToken()`
- [ ] On app launch: `getTokens()` from SecureStore → if present, set store + trigger background token validation
- [ ] `app/(auth)/login.tsx` — same login form as web, touch-optimized (large inputs, keyboard handling)
- [ ] `lib/api/client.ts` — Axios with same interceptors as web (401 auto-refresh)
- [ ] `app/(auth)/setup/` — onboarding wizard screens matching web (Expo Router screen per step)

---

## MOB-3: Bottom Tab Navigation & Dashboard

- [ ] `app/(tabs)/_layout.tsx` — 5-tab bar: Dashboard, Inventory, Finance, Staff, AI
  - Hide tab bar on nested screens (via Expo Router `<Stack>` inside each tab)
- [ ] `app/(tabs)/dashboard.tsx` — compact mobile dashboard:
  - Today's KPI strip: Net Sales, Cash Over/Short, Low Stock count (tappable → Inventory)
  - Incomplete critical tasks count with red badge (tappable → task list)
  - Quick Actions grid (2×2): "Log Waste", "Clock In/Out", "Log Expense", "Stock Count"
  - Last sync timestamp shown at bottom

---

## MOB-4: Inventory — Stock Count Workflow

- [ ] `app/(tabs)/inventory/count.tsx`:
  - List of active count sessions (from server) + "Start New Count" button
  - For in-progress session: navigate to count items screen
- [ ] `app/(tabs)/inventory/count-session.tsx` (pushed route):
  - Reads items from WatermelonDB `count_session_items` (synced from server on session start)
  - Grouped by storage_location (tabs: Walk-In / Dry Storage / Freezer / Bar)
  - Each row: `components/inventory/CountItemRow.tsx`:
    - Item name + expected quantity (ghost text)
    - Tap row → `components/shared/NumberPad.tsx` pops up at bottom
    - Enter counted quantity → save to WatermelonDB locally → background push to server
  - Progress indicator: "42 / 120 counted"
  - "Complete Count" button → `POST /api/inventory/counts/{id}/complete` (requires connectivity)
- [ ] `components/shared/NumberPad.tsx` — large-finger-friendly numeric keypad with decimal support, backspace, confirm

---

## MOB-5: Inventory — Waste Logging (Primary Daily Screen)

- [ ] `app/(tabs)/inventory/waste.tsx` — **the most-used screen in the app**:
  - Top: Voice input button (hold-to-record) → see MOB-7
  - Recent waste logs list (last 24h from server)
  - "Log Waste" FAB button
- [ ] `components/inventory/WasteQuickLog.tsx` — bottom sheet:
  1. Search item (local WatermelonDB autocomplete, works offline)
  2. Reason chips: Spoilage / Prep Waste / Overproduction / Cooking Error / Contamination (horizontal scroll)
  3. Quantity input via `NumberPad` + unit display
  4. Optional station text input
  5. Optional photo capture (`expo-camera`)
  6. "Log Waste" button:
     - If online: POST to `/api/inventory/waste` directly
     - If offline: save to WatermelonDB `waste_logs_pending` (syncs later)
     - Either way: update local `inventory_items.current_stock` in WatermelonDB

---

## MOB-6: Inventory — Receiving & Item List

- [ ] `app/(tabs)/inventory/receive.tsx`:
  - List of open POs (GET `/api/inventory/purchase-orders?status=sent`)
  - Tap PO → pre-fill receiving form
  - "Ad-hoc Receipt" option (no PO)
  - Per line item: enter received quantity + actual price; mark condition (good/damaged/rejected)
  - Invoice photo capture → upload via File Service
  - "Confirm Receipt" (requires connectivity; shows loading state)
- [ ] `app/(tabs)/inventory/index.tsx` — item list:
  - Grouped by storage_location (section list)
  - Each item: name, current_stock vs. PAR level (small progress bar), ABC badge
  - Low stock items highlighted in red
  - Search box + ABC filter at top
- [ ] `app/(tabs)/inventory/scan.tsx` — barcode scanner:
  - `expo-barcode-scanner` fullscreen
  - On scan: GET `/api/inventory/items/by-barcode/{code}` → navigate to item detail or waste log

---

## MOB-7: Voice Input for Waste & Stock Count

- [ ] `components/inventory/VoiceInput.tsx`:
  - Hold-to-record button (press-and-hold)
  - `expo-av` records audio in WAV format while button held
  - On release: upload audio → `POST /api/ai/voice/transcribe` with `command_type=waste`
  - On response: pre-fill `WasteQuickLog` fields (item, quantity, unit, reason)
  - Loading spinner during transcription
  - Confidence < 0.7 → show "Did you mean...?" confirmation before pre-filling
- [ ] Same component usable in stock count screen with `command_type=stock_count`

---

## MOB-8: Finance — DSR & Expense Entry

- [ ] `app/(tabs)/finance/daily-report.tsx` — same 4-step DSR wizard as web, touch-optimized:
  - Large tap targets for all inputs
  - Numeric keyboard for amount fields
  - Payment breakdown step shows quick-add buttons per payment method
- [ ] `app/(tabs)/finance/expense.tsx` — quick expense entry:
  - Photo capture as first step → auto-OCR if online (Mindee via AI Service) → pre-fill fields
  - Account selector (bottom sheet searchable list)
  - Vendor selector + amount + date
  - Submit → works online only (complex validation)
- [ ] `app/(tabs)/finance/index.tsx` — compact finance overview:
  - This week's net_sales sparkline
  - Top 3 expense categories (bar)
  - Pending reconciliations count with CTA

---

## MOB-9: Staff — Schedule & Clock-In/Out

- [ ] `app/(tabs)/staff/schedule.tsx` — staff view (own schedule only):
  - Current week view: list of shifts with date, time, role, station
  - "Request Swap" button on future shifts (posts to server for manager approval)
- [ ] Clock-in/out (accessible from Dashboard quick action):
  - `POST /api/staff/attendance/clock-in` — capture location via `expo-location` (geofence verification Phase 2)
  - Shows active shift info while clocked in
  - "Clock Out" + optional break time entry
- [ ] Task checklist view for own tasks (today's tasks with completion toggle + camera for photo tasks)
- [ ] Shift feedback submission (star rating + issues checkboxes after clock-out)

# EPIC: PKG — Shared Packages

**Phase:** 4 | **Weeks:** 10–14
**Packages:** `packages/types`, `packages/ui`, `packages/api-client`
**Goal:** DRY shared code across web + mobile. Generated TypeScript types from OpenAPI specs. Shared UI components. Shared Axios API client with interceptors.
**Depends on:** All 9 services have running OpenAPI docs endpoints
**Blocks:** Nothing blocking (optional layer — web/mobile can import locally until packages ready)

---

## PKG-1: packages/types — Generated TypeScript Types

- [ ] Create `packages/types/package.json` with `name: "@kitchenledger/types"`, exports via `index.ts`
- [ ] Add `generate:types` script to root `package.json`:
  ```bash
  # Requires all services running
  curl http://localhost:8081/v3/api-docs > /tmp/auth-spec.json
  curl http://localhost:8082/v3/api-docs > /tmp/inventory-spec.json
  curl http://localhost:8083/v3/api-docs > /tmp/finance-spec.json
  curl http://localhost:8088/v3/api-docs > /tmp/staff-spec.json
  curl http://localhost:8084/openapi.json > /tmp/ai-spec.json
  curl http://localhost:8086/openapi.json > /tmp/notification-spec.json
  curl http://localhost:8085/openapi.json > /tmp/file-spec.json
  curl http://localhost:8087/openapi.json > /tmp/report-spec.json
  npx openapi-typescript /tmp/auth-spec.json -o packages/types/src/auth.d.ts
  npx openapi-typescript /tmp/inventory-spec.json -o packages/types/src/inventory.d.ts
  npx openapi-typescript /tmp/finance-spec.json -o packages/types/src/finance.d.ts
  npx openapi-typescript /tmp/staff-spec.json -o packages/types/src/staff.d.ts
  npx openapi-typescript /tmp/ai-spec.json -o packages/types/src/ai.d.ts
  ```
- [ ] `packages/types/src/index.ts` — re-export all generated types
- [ ] Add `springdoc-openapi-starter-webmvc-ui` to each Java service pom.xml so `/v3/api-docs` works
- [ ] Add `fastapi` auto-generated `/openapi.json` (built-in, no extra config for Python)
- [ ] **Test:** `import { InventoryItem } from '@kitchenledger/types'` in `apps/web` compiles without errors.

---

## PKG-2: packages/ui — Shared Component Library

- [ ] Create `packages/ui/package.json` with `name: "@kitchenledger/ui"`, peer deps: react, react-native, tailwindcss
- [ ] Configure `tsconfig.json` for library output
- [ ] Shared base components (usable on both web + React Native where applicable):
  - `KPICard` — metric name, value, % change arrow, color from benchmarkStatus (GOOD/WARNING/DANGER)
  - `BenchmarkBadge` — green/yellow/red pill with label
  - `DataTable` — generic paginated sortable table (web only — uses Tailwind)
  - `NumberPad` — large touch-friendly numpad (React Native — used by mobile count + waste)
  - `OfflineBanner` — yellow "You're offline" banner (React Native)
- [ ] shadcn/ui-compatible components re-exported for web: Button, Input, Select, Dialog, Sheet, Table, Badge, Card, Tabs, Popover
- [ ] `packages/ui/src/index.ts` — export all components
- [ ] **Test:** Import `KPICard` into `apps/web` — renders without errors. Import `NumberPad` into `apps/mobile` — renders.

---

## PKG-3: packages/api-client — Typed API Client

- [ ] Create `packages/api-client/package.json` with `name: "@kitchenledger/api-client"`
- [ ] `src/client.ts` — Axios instance with:
  - `baseURL` configurable via `init(baseUrl, getToken, onUnauthorized)`
  - Request interceptor: inject Bearer token from `getToken()` callback
  - Response interceptor: on 401 → call `onUnauthorized()` callback (app-level handles refresh)
- [ ] Typed API wrappers per service:
  - `src/inventory.api.ts` — all inventory endpoints typed (returns typed promises)
  - `src/finance.api.ts` — all finance endpoints
  - `src/auth.api.ts` — auth endpoints
  - `src/staff.api.ts` — staff endpoints
  - `src/ai.api.ts` — AI endpoints (OCR, voice, query)
  - `src/notifications.api.ts` — notification endpoints
  - `src/files.api.ts` — file upload endpoints
  - `src/reports.api.ts` — report job endpoints
- [ ] `src/index.ts` — export all API objects + `initApiClient()`
- [ ] **Test:** `apps/web` migrates to use `@kitchenledger/api-client` for one module (inventory) — all types inferred correctly.

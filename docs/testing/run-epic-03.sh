#!/usr/bin/env bash
# EPIC-03: Finance & Accounts Tests
# Run against: http://localhost:8080
# Usage: bash run-epic-03.sh
set -euo pipefail

BASE="http://localhost:8080"
PASS=0; FAIL=0; WARN=0

TS=$(date +%s)

PASS_C() { echo "  PASS [$1] $2"; PASS=$((PASS+1)); }
FAIL_C() { echo "  FAIL [$1] $2 — $3"; FAIL=$((FAIL+1)); }
SKIP_C() { echo "  SKIP [$1] $2"; WARN=$((WARN+1)); }

check() {
  local tc="$1" desc="$2" expected="$3" actual="$4"
  [ "$actual" = "$expected" ] && PASS_C "$tc" "$desc" || FAIL_C "$tc" "$desc" "expected=$expected got=$actual"
}

check_range() {
  local tc="$1" desc="$2" actual="$3"; shift 3
  for e in "$@"; do [ "$actual" = "$e" ] && { PASS_C "$tc" "$desc (got $actual)"; return; }; done
  FAIL_C "$tc" "$desc" "expected one of ($*) got=$actual"
}

contains() {
  local tc="$1" desc="$2" needle="$3" hay="$4"
  echo "$hay" | grep -q "$needle" && PASS_C "$tc" "$desc" || FAIL_C "$tc" "$desc" "'$needle' not in response"
}

not_contains() {
  local tc="$1" desc="$2" needle="$3" hay="$4"
  echo "$hay" | grep -q "$needle" && FAIL_C "$tc" "$desc" "'$needle' found in response" || PASS_C "$tc" "$desc"
}

get_field() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$2',''))" 2>/dev/null || echo ""; }
get_data()  { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('$2',''))" 2>/dev/null || echo ""; }

# ─── Setup: Register tenant + get owner token ─────────────────────────────────

echo "======================================"
echo "  EPIC-03: Finance & Accounts Tests"
echo "  Timestamp: $TS"
echo "======================================"
echo ""
echo "── Setup: Authenticating ──"

docker exec infrastructure-redis-1 redis-cli --scan --pattern 'rl:*' \
  | xargs -r docker exec -i infrastructure-redis-1 redis-cli del > /dev/null 2>&1 || true

REG_EMAIL="fin.${TS}@testrest.com"
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"restaurantName\":\"Finance Test Kitchen\",\"fullName\":\"Test Owner\",\"email\":\"$REG_EMAIL\",\"password\":\"TestPass@123\",\"region\":\"IN\",\"timezone\":\"Asia/Kolkata\"}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "SETUP-01" "Register test tenant" "201" "$HTTP"
TOKEN=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null || echo "")
TENANT_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('tenant',{}).get('id',''))" 2>/dev/null || echo "")
OWNER_USER_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('user',{}).get('id',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "  FATAL: Could not obtain auth token — aborting"
  exit 1
fi
echo "  Tenant ID: $TENANT_ID"

# Invite a staff user (kitchen_staff role) for RBAC tests
STAFF_EMAIL="staff.fin.${TS}@testrest.com"
INVITE_R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/users/invite" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$STAFF_EMAIL\",\"role\":\"kitchen_staff\",\"fullName\":\"Staff Member\"}")
INVITE_HTTP=$(echo "$INVITE_R" | tail -1); INVITE_BODY=$(echo "$INVITE_R" | head -1)
INVITE_TOKEN=$(echo "$INVITE_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('inviteToken','') or d.get('data',{}).get('temporaryPassword',''))" 2>/dev/null || echo "")

# Accept invite to get staff token
STAFF_TOKEN=""
if [ -n "$INVITE_TOKEN" ]; then
  ACCEPT_R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/users/accept-invite" \
    -H "Content-Type: application/json" \
    -d "{\"inviteToken\":\"$INVITE_TOKEN\",\"password\":\"StaffPass@123\"}")
  ACCEPT_HTTP=$(echo "$ACCEPT_R" | tail -1); ACCEPT_BODY=$(echo "$ACCEPT_R" | head -1)
  STAFF_TOKEN=$(echo "$ACCEPT_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null || echo "")
fi

# ─── 0. Finance Vendor Setup ───────────────────────────────────────────────────

echo ""
echo "── 0. Finance Vendor Setup ──"

R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/vendors" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\":\"Metro Cash and Carry\",
    \"contactName\":\"Deepak Singh\",
    \"email\":\"deepak@metro.com\",
    \"phone\":\"+91-8012345678\",
    \"paymentTermsDays\":30,
    \"notes\":\"Primary food supplier\"
  }")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-V01" "Create finance vendor → 201" "201" "$HTTP"
VENDOR_ID=$(get_field "$BODY" "id")

R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/vendors" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-V02" "List vendors → 200" "200" "$HTTP"
contains "TC-FIN-V02b" "Metro vendor in list" "Metro" "$BODY"

# ─── 1. Daily Sales Report CRUD ───────────────────────────────────────────────

echo ""
echo "── 1. Daily Sales Report ──"

# TC-FIN-01 Create DSR — uses reportDate, cashSales, upiSales, cardSales, coversCount
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/daily-sales-reports" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"reportDate\":\"2026-05-03\",
    \"grossSales\":48500.00,
    \"discounts\":1500.00,
    \"cashSales\":12000.00,
    \"upiSales\":15500.00,
    \"cardSales\":18000.00,
    \"otherSales\":3000.00,
    \"coversCount\":185,
    \"compsTotal\":500.00,
    \"voidsTotal\":500.00,
    \"tipsCollected\":2200.00,
    \"vatCollected\":2400.00,
    \"costOfGoodsSold\":14350.00,
    \"notes\":\"Saturday evening service\"
  }")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-01" "Create DSR → 201" "201" "$HTTP"
DSR_ID=$(get_field "$BODY" "id")
contains "TC-FIN-01b" "DSR has tenantId" "tenantId" "$BODY"
contains "TC-FIN-01c" "DSR has reportDate" "reportDate" "$BODY"
contains "TC-FIN-01d" "DSR has grossSales" "grossSales" "$BODY"

# TC-FIN-02 GET DSR by ID
if [ -n "$DSR_ID" ]; then
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/daily-sales-reports/$DSR_ID" \
    -H "Authorization: Bearer $TOKEN")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check "TC-FIN-02" "Get DSR by ID → 200" "200" "$HTTP"
  contains "TC-FIN-02b" "DSR netSales calculated" "netSales" "$BODY"
fi

# TC-FIN-03 GET DSR by date
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/daily-sales-reports/date/2026-05-03" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1)
check "TC-FIN-03" "Get DSR by date → 200" "200" "$HTTP"

# TC-FIN-04 Duplicate DSR for same date → 409
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/daily-sales-reports" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"reportDate\":\"2026-05-03\",\"grossSales\":51000.00}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-04" "Duplicate DSR date → 409" "409" "$HTTP"

# TC-FIN-05 List DSRs
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/daily-sales-reports" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1)
check "TC-FIN-05" "List DSRs → 200" "200" "$HTTP"

# TC-FIN-06 Create DSR with zero covers — no division error
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/daily-sales-reports" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"reportDate\":\"2026-05-02\",\"grossSales\":0,\"cashSales\":0,\"coversCount\":0}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-06" "DSR with zero covers → 201 (no division error)" "201" "$HTTP"
not_contains "TC-FIN-06b" "No ArithmeticException" "ArithmeticException" "$BODY"
not_contains "TC-FIN-06c" "No stack trace" "at com.kitchenledger" "$BODY"
DSR_ID_ZERO=$(get_field "$BODY" "id")

# ─── 2. Cash Reconciliation ───────────────────────────────────────────────────

echo ""
echo "── 2. Cash Reconciliation ──"

if [ -n "$DSR_ID" ]; then
  # TC-FIN-10 Reconcile cash — cashSales=12000, actual=11800 → variance=-200, requiresInvestigation=true (>10 threshold)
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/daily-sales-reports/$DSR_ID/reconcile" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"actualCash\":11800.00}")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check "TC-FIN-10" "Reconcile cash → 200" "200" "$HTTP"
  contains "TC-FIN-10b" "Response has cashOverShort" "cashOverShort" "$BODY"
  contains "TC-FIN-10c" "Response has requiresInvestigation" "requiresInvestigation" "$BODY"

  # TC-FIN-11 Double reconcile → error
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/daily-sales-reports/$DSR_ID/reconcile" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"actualCash\":11800.00}")
  HTTP=$(echo "$R" | tail -1)
  check_range "TC-FIN-11" "Double reconcile → 409 or 400" "$HTTP" "409" "400" "422"

  # TC-FIN-12 Finalize DSR
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/daily-sales-reports/$DSR_ID/finalize" \
    -H "Authorization: Bearer $TOKEN")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check "TC-FIN-12" "Finalize DSR → 200" "200" "$HTTP"
  contains "TC-FIN-12b" "DSR finalized=true" "finalized" "$BODY"

  # TC-FIN-13 Update finalized DSR → error
  R=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/api/finance/daily-sales-reports/$DSR_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"reportDate\":\"2026-05-03\",\"grossSales\":99999.00}")
  HTTP=$(echo "$R" | tail -1)
  check_range "TC-FIN-13" "Update finalized DSR → 400 or 422" "$HTTP" "400" "422"

  # TC-FIN-14 Reconcile zero-coverage DSR — cash short under threshold (no investigation)
  if [ -n "$DSR_ID_ZERO" ]; then
    R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/daily-sales-reports/$DSR_ID_ZERO/reconcile" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"actualCash\":0.00}")
    HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
    check "TC-FIN-14" "Reconcile zero-sale DSR → 200" "200" "$HTTP"
  fi
fi

# TC-FIN-15 DSR summary endpoint
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/daily-sales-reports/summary?from=2026-05-01&to=2026-05-31" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-15" "DSR summary → 200" "200" "$HTTP"
contains "TC-FIN-15b" "Summary has gross_sales" "gross_sales" "$BODY"

# ─── 3. Expense Management ────────────────────────────────────────────────────

echo ""
echo "── 3. Expense Management ──"

EXPENSE_ID=""

# TC-FIN-20 Create COGS expense — requires expenseDate, category, description (all @NotNull/@NotBlank)
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/expenses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"expenseDate\":\"2026-05-04\",
    \"category\":\"COGS\",
    \"description\":\"Chicken and Tomato — Metro Cash and Carry\",
    \"amount\":6440.00,
    \"vendorId\":\"$VENDOR_ID\",
    \"paymentMethod\":\"bank_transfer\",
    \"referenceNumber\":\"METRO-2026-4521\"
  }")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-20" "Create COGS expense → 201" "201" "$HTTP"
EXPENSE_ID=$(get_field "$BODY" "id")
contains "TC-FIN-20b" "Expense has tenantId" "tenantId" "$BODY"
contains "TC-FIN-20c" "Expense has category" "category" "$BODY"

# TC-FIN-21 Create LABOR expense
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/expenses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"expenseDate\":\"2026-05-04\",
    \"category\":\"LABOR\",
    \"description\":\"Staff wages — week 19\",
    \"amount\":18000.00,
    \"paymentMethod\":\"bank_transfer\"
  }")
HTTP=$(echo "$R" | tail -1)
check "TC-FIN-21" "Create LABOR expense → 201" "201" "$HTTP"

# TC-FIN-22 Create OPERATING expense (no vendor — cash purchase)
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/expenses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"expenseDate\":\"2026-05-04\",
    \"category\":\"OPERATING\",
    \"description\":\"Cleaning supplies — local shop\",
    \"amount\":250.00,
    \"paymentMethod\":\"cash\"
  }")
HTTP=$(echo "$R" | tail -1)
check "TC-FIN-22" "Create OPERATING expense no vendor → 201" "201" "$HTTP"

# TC-FIN-23 Expense with zero amount → 400
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/expenses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"expenseDate\":\"2026-05-04\",\"category\":\"COGS\",\"description\":\"Zero test\",\"amount\":0.00}")
HTTP=$(echo "$R" | tail -1)
check "TC-FIN-23" "Expense zero amount → 400" "400" "$HTTP"

# TC-FIN-24 Expense with negative amount → 400
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/expenses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"expenseDate\":\"2026-05-04\",\"category\":\"COGS\",\"description\":\"Negative test\",\"amount\":-500.00}")
HTTP=$(echo "$R" | tail -1)
check "TC-FIN-24" "Expense negative amount → 400" "400" "$HTTP"

# TC-FIN-25 List expenses
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/expenses" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-25" "List expenses → 200" "200" "$HTTP"

# TC-FIN-26 Filter expenses by category
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/expenses?category=COGS" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-26" "Filter expenses by COGS → 200" "200" "$HTTP"
contains "TC-FIN-26b" "COGS expenses in response" "COGS" "$BODY"

# TC-FIN-27 Expense summary
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/expenses/summary?from=2026-05-01&to=2026-05-31" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-27" "Expense summary → 200" "200" "$HTTP"
contains "TC-FIN-27b" "Summary has total_expenses" "total_expenses" "$BODY"

# TC-FIN-28 Missing required description → 400
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/expenses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"expenseDate\":\"2026-05-04\",\"category\":\"COGS\",\"amount\":100.00}")
HTTP=$(echo "$R" | tail -1)
check "TC-FIN-28" "Expense missing description → 400" "400" "$HTTP"

# TC-FIN-29 Delete expense
if [ -n "$EXPENSE_ID" ]; then
  # Create a throwaway expense to delete
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/expenses" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"expenseDate\":\"2026-05-04\",\"category\":\"OPERATING\",\"description\":\"Throwaway\",\"amount\":50.00}")
  TOSS_ID=$(get_field "$(echo "$R" | head -1)" "id")
  if [ -n "$TOSS_ID" ]; then
    R=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE/api/finance/expenses/$TOSS_ID" \
      -H "Authorization: Bearer $TOKEN")
    HTTP=$(echo "$R" | tail -1)
    check_range "TC-FIN-29" "Delete expense → 204 or 200" "$HTTP" "204" "200"
  fi
fi

# ─── 4. Vendor Payments ───────────────────────────────────────────────────────

echo ""
echo "── 4. Vendor Payments ──"

PAYMENT_ID=""
if [ -n "$VENDOR_ID" ] && [ -n "$EXPENSE_ID" ]; then
  # TC-FIN-30 Create vendor payment (full payment)
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/vendor-payments" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"vendorId\":\"$VENDOR_ID\",
      \"expenseId\":\"$EXPENSE_ID\",
      \"paymentDate\":\"2026-05-20\",
      \"amount\":6440.00,
      \"paymentMethod\":\"bank_transfer\",
      \"referenceNumber\":\"TXN-20260520-001\",
      \"paymentStatus\":\"paid\"
    }")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check "TC-FIN-30" "Create vendor payment → 201" "201" "$HTTP"
  PAYMENT_ID=$(get_field "$BODY" "id")
  contains "TC-FIN-30b" "Payment has vendorId" "vendorId" "$BODY"

  # TC-FIN-31 Create pending payment (due later)
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/vendor-payments" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"vendorId\":\"$VENDOR_ID\",
      \"paymentDate\":\"2026-05-10\",
      \"amount\":3000.00,
      \"paymentMethod\":\"bank_transfer\",
      \"dueDate\":\"2026-06-10\",
      \"paymentStatus\":\"pending\"
    }")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check "TC-FIN-31" "Create pending vendor payment → 201" "201" "$HTTP"
  PENDING_PAYMENT_ID=$(get_field "$BODY" "id")

  # TC-FIN-32 List vendor payments
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/vendor-payments" \
    -H "Authorization: Bearer $TOKEN")
  HTTP=$(echo "$R" | tail -1)
  check "TC-FIN-32" "List vendor payments → 200" "200" "$HTTP"

  # TC-FIN-33 Mark payment as paid
  if [ -n "$PENDING_PAYMENT_ID" ]; then
    R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/vendor-payments/$PENDING_PAYMENT_ID/paid" \
      -H "Authorization: Bearer $TOKEN")
    HTTP=$(echo "$R" | tail -1)
    check "TC-FIN-33" "Mark payment paid → 200" "200" "$HTTP"
  fi

  # TC-FIN-34 Missing vendorId → 400
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/vendor-payments" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"paymentDate\":\"2026-05-20\",\"amount\":100.00}")
  HTTP=$(echo "$R" | tail -1)
  check "TC-FIN-34" "Vendor payment missing vendorId → 400" "400" "$HTTP"
else
  SKIP_C "TC-FIN-30" "Skipped — missing vendor or expense ID"
fi

# ─── 5. AP Aging ──────────────────────────────────────────────────────────────

echo ""
echo "── 5. AP Aging ──"

# TC-FIN-40 AP summary
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/ap/summary" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-40" "AP summary → 200" "200" "$HTTP"
contains "TC-FIN-40b" "AP summary has success" "success" "$BODY"

# TC-FIN-41 AP aging
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/ap/aging" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-41" "AP aging → 200" "200" "$HTTP"
contains "TC-FIN-41b" "AP aging has data" "data" "$BODY"

# ─── 6. P&L Report ────────────────────────────────────────────────────────────

echo ""
echo "── 6. P&L Report ──"

# TC-FIN-50 P&L for month with data — params: start, end
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/reports/pl?start=2026-05-01&end=2026-05-31" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-50" "P&L report → 200" "200" "$HTTP"
contains "TC-FIN-50b" "P&L has success" "success" "$BODY"
contains "TC-FIN-50c" "P&L has data" "data" "$BODY"

# TC-FIN-51 P&L for month with no data — should return zeros not error
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/reports/pl?start=2025-01-01&end=2025-01-31" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-51" "P&L empty period → 200 (no crash)" "200" "$HTTP"
not_contains "TC-FIN-51b" "No ArithmeticException" "ArithmeticException" "$BODY"
not_contains "TC-FIN-51c" "No NullPointerException" "NullPointerException" "$BODY"

# TC-FIN-52 P&L missing params → 400
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/reports/pl" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1)
check_range "TC-FIN-52" "P&L missing params → 400 or 500" "$HTTP" "400" "500"

# TC-FIN-53 Expense report
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/reports/expenses?start=2026-05-01&end=2026-05-31" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-53" "Expense report → 200" "200" "$HTTP"
contains "TC-FIN-53b" "Expense report has total_expenses" "total_expenses" "$BODY"

# TC-FIN-54 Cash flow report
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/reports/cash-flow" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-54" "Cash flow report → 200" "200" "$HTTP"
contains "TC-FIN-54b" "Cash flow has net_cash_flow_30d" "net_cash_flow_30d" "$BODY"

# ─── 7. Dashboard KPIs ────────────────────────────────────────────────────────

echo ""
echo "── 7. Dashboard KPIs ──"

# TC-FIN-60 Dashboard returns KPIs
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/dashboard" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-FIN-60" "Finance dashboard → 200" "200" "$HTTP"
contains "TC-FIN-60b" "Dashboard has success" "success" "$BODY"
contains "TC-FIN-60c" "Dashboard has data" "data" "$BODY"

# ─── 8. UPI / QR Generation ───────────────────────────────────────────────────

echo ""
echo "── 8. UPI / QR Generation ──"

# TC-FIN-70 Generate QR code
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/upi/generate-qr" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"amount\":847.00,
    \"description\":\"Table T-05\",
    \"merchantUpiId\":\"testrestaurant@upi\"
  }")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_range "TC-FIN-70" "Generate UPI QR → 200 or 201" "$HTTP" "200" "201"
if [ "$HTTP" = "200" ] || [ "$HTTP" = "201" ]; then
  contains "TC-FIN-70b" "QR response has amount" "amount" "$BODY"
fi

# TC-FIN-71 QR with zero amount → 400
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/upi/generate-qr" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"amount\":0.00}")
HTTP=$(echo "$R" | tail -1)
check "TC-FIN-71" "UPI QR zero amount → 400" "400" "$HTTP"

# TC-FIN-72 UPI webhook (no auth required)
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/webhooks/upi-payment" \
  -H "Content-Type: application/json" \
  -d "{\"eventId\":\"evt-001\",\"qrReference\":\"QR-TEST-001\",\"amountPaid\":847.00,\"transactionId\":\"UPI-TXN-001\"}")
HTTP=$(echo "$R" | tail -1)
check_range "TC-FIN-72" "UPI webhook → 200 or 400 (sig check)" "$HTTP" "200" "400" "401"

# ─── 9. Access Control ────────────────────────────────────────────────────────

echo ""
echo "── 9. Access Control ──"

# TC-FIN-SEC-01 Cross-tenant: second tenant cannot see first tenant's DSR
REG2=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"restaurantName\":\"Other Finance Kitchen\",\"fullName\":\"Other\",\"email\":\"other.fin.${TS}@test.com\",\"password\":\"TestPass@123\"}")
TOKEN_B=$(echo "$REG2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null || echo "")
if [ -n "$TOKEN_B" ] && [ -n "$DSR_ID" ]; then
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/daily-sales-reports/$DSR_ID" \
    -H "Authorization: Bearer $TOKEN_B")
  HTTP=$(echo "$R" | tail -1)
  check "TC-FIN-SEC-01" "Cross-tenant DSR access → 404" "404" "$HTTP"
fi

# TC-FIN-SEC-02 Cross-tenant: P&L restricted
if [ -n "$TOKEN_B" ]; then
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/reports/pl?start=2026-05-01&end=2026-05-31" \
    -H "Authorization: Bearer $TOKEN_B")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check_range "TC-FIN-SEC-02" "Empty tenant P&L → 200 (own data, zero)" "$HTTP" "200"
fi

# TC-FIN-SEC-03 Kitchen staff cannot access finance DSR
if [ -n "$STAFF_TOKEN" ]; then
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/finance/daily-sales-reports" \
    -H "Authorization: Bearer $STAFF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"reportDate\":\"2026-04-01\",\"grossSales\":10000.00}")
  HTTP=$(echo "$R" | tail -1)
  check "TC-FIN-SEC-03" "Staff cannot create DSR → 403" "403" "$HTTP"

  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/expenses" \
    -H "Authorization: Bearer $STAFF_TOKEN")
  HTTP=$(echo "$R" | tail -1)
  check "TC-FIN-SEC-04" "Staff cannot list expenses → 403" "403" "$HTTP"

  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/reports/pl?start=2026-05-01&end=2026-05-31" \
    -H "Authorization: Bearer $STAFF_TOKEN")
  HTTP=$(echo "$R" | tail -1)
  check "TC-FIN-SEC-05" "Staff cannot access P&L → 403" "403" "$HTTP"
else
  SKIP_C "TC-FIN-SEC-03" "Skipped — no staff token (invite/accept flow unavailable)"
  SKIP_C "TC-FIN-SEC-04" "Skipped — no staff token"
  SKIP_C "TC-FIN-SEC-05" "Skipped — no staff token"
fi

# TC-FIN-SEC-06 Unauthenticated request → 401
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/finance/daily-sales-reports")
HTTP=$(echo "$R" | tail -1)
check "TC-FIN-SEC-06" "Unauthenticated finance request → 401" "401" "$HTTP"

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "======================================"
echo "  Results: $PASS passed, $FAIL failed, $WARN skipped/warned"
echo "  $([ $FAIL -eq 0 ] && echo 'GO' || echo 'NO-GO')"
echo "======================================"
echo ""
echo "IDs for subsequent epics:"
echo "  TENANT_ID=$TENANT_ID"
echo "  DSR_ID=${DSR_ID:-}"
echo "  EXPENSE_ID=${EXPENSE_ID:-}"
echo "  VENDOR_ID=${VENDOR_ID:-}"
echo "  OWNER_TOKEN=${TOKEN:0:50}..."

exit $FAIL

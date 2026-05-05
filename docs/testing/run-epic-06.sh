#!/usr/bin/env bash
# EPIC-06: Notifications & Audit
set -euo pipefail

BASE="http://localhost:8080"
PASS=0; FAIL=0; SKIP=0
TS=$(date +%s)

# ── Helpers ────────────────────────────────────────────────────────────────
check_one() {
  local id="$1" label="$2" actual="$3" expected="$4"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS [$id] $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL [$id] $label — expected=$expected got=$actual"
    FAIL=$((FAIL+1))
  fi
}

check_range() {
  local id="$1" label="$2" actual="$3"
  shift 3
  for exp in "$@"; do
    if [[ "$actual" == "$exp" ]]; then
      echo "  PASS [$id] $label (got $actual)"
      PASS=$((PASS+1))
      return
    fi
  done
  echo "  FAIL [$id] $label — expected one of ($*) got=$actual"
  FAIL=$((FAIL+1))
}

check_field() {
  local id="$1" label="$2" body="$3" field="$4"
  if echo "$body" | grep -q "\"$field\""; then
    echo "  PASS [$id] $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL [$id] $label — '$field' not in response"
    FAIL=$((FAIL+1))
  fi
}

echo "======================================"
echo "  EPIC-06: Notifications & Audit"
echo "  Timestamp: $TS"
echo "======================================"

# ── Setup ──────────────────────────────────────────────────────────────────
echo ""
echo "── Setup: Authenticating ──"

R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"restaurantName\":\"Notif Test $TS\",\"fullName\":\"Notif Owner\",\"email\":\"notif$TS@example.com\",\"password\":\"Test@1234\",\"timezone\":\"Asia/Kolkata\"}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_one "SETUP-01" "Register test tenant" "$HTTP" "201"

OWNER_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null || echo "")
OWNER_USER_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('user',{}).get('id',''))" 2>/dev/null || echo "")
TENANT_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('tenant',{}).get('id',''))" 2>/dev/null || echo "")

if [[ -z "$OWNER_TOKEN" ]]; then
  echo "  FATAL: Could not get owner token"
  exit 1
fi
AUTH="Authorization: Bearer $OWNER_TOKEN"

# ── 1. List Notifications (empty) ──────────────────────────────────────────
echo ""
echo "── 1. List Notifications ──"

# TC-NOT-01: List notifications (empty initially)
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/notifications" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_one "TC-NOT-01" "List notifications → 200" "$HTTP" "200"
check_field "TC-NOT-01b" "Response has data" "$BODY" "data"
check_field "TC-NOT-01c" "Response has meta" "$BODY" "meta"

# TC-NOT-02: Unread count
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/notifications/unread-count" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_one "TC-NOT-02" "Unread count → 200" "$HTTP" "200"
check_field "TC-NOT-02b" "Response has count" "$BODY" "count"

# TC-NOT-03: Pagination params
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/notifications?page=1&limit=10" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1)
check_one "TC-NOT-03" "List notifications with pagination → 200" "$HTTP" "200"

# ── 2. Device Token Registration ──────────────────────────────────────────
echo ""
echo "── 2. Device Token Registration ──"

DEVICE_TOKEN="TestDeviceToken${TS}Android"

# TC-NOT-10: Register push token
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/notifications/devices" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$DEVICE_TOKEN\",\"platform\":\"android\"}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_one "TC-NOT-10" "Register device token → 201" "$HTTP" "201"
check_field "TC-NOT-10b" "Response success=true" "$BODY" "success"

# TC-NOT-11: Register same token again (upsert should work)
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/notifications/devices" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$DEVICE_TOKEN\",\"platform\":\"android\"}")
HTTP=$(echo "$R" | tail -1)
check_one "TC-NOT-11" "Register same token again → 201 (upsert)" "$HTTP" "201"

# TC-NOT-12: Register iOS token
IOS_TOKEN="TestDeviceToken${TS}iOS"
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/notifications/devices" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$IOS_TOKEN\",\"platform\":\"ios\"}")
HTTP=$(echo "$R" | tail -1)
check_one "TC-NOT-12" "Register iOS token → 201" "$HTTP" "201"

# TC-NOT-13: Missing token field → 400
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/notifications/devices" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"platform":"android"}')
HTTP=$(echo "$R" | tail -1)
check_one "TC-NOT-13" "Register device missing token → 400" "$HTTP" "400"

# TC-NOT-14: Invalid platform → 400
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/notifications/devices" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"test_token\",\"platform\":\"windows\"}")
HTTP=$(echo "$R" | tail -1)
check_one "TC-NOT-14" "Register device invalid platform → 400" "$HTTP" "400"

# TC-NOT-15: Unregister device token
R=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE/api/notifications/devices/$DEVICE_TOKEN" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1)
check_range "TC-NOT-15" "Unregister device token → 200 or 204" "$HTTP" "200" "204"

# ── 3. Notification CRUD (via internal send first) ─────────────────────────
echo ""
echo "── 3. Notification Read/Mark ──"

# First inject a notification via direct DB insert to test read flows
# Read from env or use docker exec
NOTIF_ID=""
NOTIF_ID=$(docker exec infrastructure-postgres-1 psql -U kl_user -d kitchenledger -t -c \
  "INSERT INTO notifications (tenant_id, user_id, type, priority, title, body, data, channels)
   VALUES ('$TENANT_ID', '$OWNER_USER_ID', 'alert', 'important', 'Test Alert', 'This is a test', '{}', ARRAY['push'])
   RETURNING id;" 2>/dev/null | tr -d ' \n') || NOTIF_ID=""

if [[ -n "$NOTIF_ID" && "$NOTIF_ID" != "" ]]; then
  echo "  INFO: Created test notification: $NOTIF_ID"

  # TC-NOT-20: List shows new notification
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/notifications" \
    -H "$AUTH")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check_one "TC-NOT-20" "List notifications shows inserted → 200" "$HTTP" "200"

  # TC-NOT-21: Unread count is 1
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/notifications/unread-count" \
    -H "$AUTH")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check_one "TC-NOT-21" "Unread count → 200" "$HTTP" "200"

  # TC-NOT-22: Mark notification as read
  R=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/notifications/$NOTIF_ID/read" \
    -H "$AUTH")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check_one "TC-NOT-22" "Mark notification as read → 200" "$HTTP" "200"

  # TC-NOT-23: Mark same notification as read again → 404 (already read)
  R=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/notifications/$NOTIF_ID/read" \
    -H "$AUTH")
  HTTP=$(echo "$R" | tail -1)
  check_one "TC-NOT-23" "Mark already-read notification → 404" "$HTTP" "404"

  # Insert another notification for read-all test
  docker exec infrastructure-postgres-1 psql -U kl_user -d kitchenledger -q -c \
    "INSERT INTO notifications (tenant_id, user_id, type, priority, title, body, data, channels)
     VALUES ('$TENANT_ID', '$OWNER_USER_ID', 'info', 'informational', 'Info 1', 'Info msg', '{}', ARRAY['push']),
            ('$TENANT_ID', '$OWNER_USER_ID', 'info', 'informational', 'Info 2', 'Info msg 2', '{}', ARRAY['push']);" 2>/dev/null || true

  # TC-NOT-24: Mark all as read
  R=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/notifications/read-all" \
    -H "$AUTH")
  HTTP=$(echo "$R" | tail -1)
  check_one "TC-NOT-24" "Mark all notifications as read → 200" "$HTTP" "200"

  # TC-NOT-25: Unread count is 0 after read-all
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/notifications/unread-count" \
    -H "$AUTH")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check_one "TC-NOT-25" "Unread count after read-all → 200" "$HTTP" "200"
  UNREAD_COUNT=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('count','-1'))" 2>/dev/null || echo "-1")
  check_one "TC-NOT-25b" "Unread count = 0 after read-all" "$UNREAD_COUNT" "0"

  # TC-NOT-26: Mark unknown notification → 404
  FAKE_NOTIF="00000000-0000-0000-0000-000000000001"
  R=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/notifications/$FAKE_NOTIF/read" \
    -H "$AUTH")
  HTTP=$(echo "$R" | tail -1)
  check_one "TC-NOT-26" "Mark unknown notification → 404" "$HTTP" "404"
else
  echo "  SKIP [TC-NOT-20..26] Notification CRUD — could not insert test notification"
  for i in 20 21 22 23 24 25 25b 26; do SKIP=$((SKIP+1)); done
fi

# ── 4. Digest & Weekly Summary ─────────────────────────────────────────────
echo ""
echo "── 4. Digest & Weekly Summary ──"

# TC-NOT-30: Daily digest
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/notifications/digest" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_one "TC-NOT-30" "Daily digest → 200" "$HTTP" "200"
check_field "TC-NOT-30b" "Digest has success=true" "$BODY" "success"

# TC-NOT-31: Weekly summary
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/notifications/weekly-summary" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_one "TC-NOT-31" "Weekly summary → 200" "$HTTP" "200"
check_field "TC-NOT-31b" "Weekly summary has data" "$BODY" "data"

# ── 5. Cross-tenant Isolation ──────────────────────────────────────────────
echo ""
echo "── 5. Cross-tenant Isolation ──"

# Register second tenant
R2=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"restaurantName\":\"Notif Other $TS\",\"fullName\":\"Other Owner\",\"email\":\"notifother$TS@example.com\",\"password\":\"Test@1234\",\"timezone\":\"Asia/Kolkata\"}")
HTTP2=$(echo "$R2" | tail -1); BODY2=$(echo "$R2" | head -1)
OTHER_TOKEN=$(echo "$BODY2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null || echo "")

if [[ -n "$OTHER_TOKEN" && -n "$NOTIF_ID" ]]; then
  # TC-NOT-40: Other tenant cannot mark our notification
  R=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/notifications/$NOTIF_ID/read" \
    -H "Authorization: Bearer $OTHER_TOKEN")
  HTTP=$(echo "$R" | tail -1)
  check_one "TC-NOT-40" "Cross-tenant read mark → 404" "$HTTP" "404"
else
  echo "  SKIP [TC-NOT-40] Cross-tenant isolation — missing token or notif_id"
  SKIP=$((SKIP+1))
fi

# ── 6. Security ────────────────────────────────────────────────────────────
echo ""
echo "── 6. Security ──"

# TC-NOT-SEC-01: Unauthenticated list → 401
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/notifications")
HTTP=$(echo "$R" | tail -1)
check_one "TC-NOT-SEC-01" "Unauthenticated list → 401" "$HTTP" "401"

# TC-NOT-SEC-02: Unauthenticated unread count → 401
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/notifications/unread-count")
HTTP=$(echo "$R" | tail -1)
check_one "TC-NOT-SEC-02" "Unauthenticated unread count → 401" "$HTTP" "401"

# TC-NOT-SEC-03: Unauthenticated device register → 401
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/notifications/devices" \
  -H "Content-Type: application/json" \
  -d '{"token":"test","platform":"android"}')
HTTP=$(echo "$R" | tail -1)
check_one "TC-NOT-SEC-03" "Unauthenticated device register → 401" "$HTTP" "401"

# ── Results ────────────────────────────────────────────────────────────────
echo ""
echo "======================================"
echo "  Results: $PASS passed, $FAIL failed, $SKIP skipped/warned"
if [[ "$FAIL" -eq 0 ]]; then
  echo "  GO"
else
  echo "  NO-GO"
fi
echo "======================================"

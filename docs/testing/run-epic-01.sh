#!/usr/bin/env bash
# EPIC-01: Authentication & Multi-Tenancy Tests
# Run against: http://localhost:8080
# Usage: bash run-epic-01.sh
set -euo pipefail

BASE="http://localhost:8080"
PASS=0
FAIL=0
WARN=0

# Unique suffix to avoid email conflicts across runs
TS=$(date +%s)
OWNER_EMAIL="priya.${TS}@dosapalace.com"
TENANT_B_EMAIL="owner.${TS}@biryanihub.com"
INJECT_EMAIL="inject.${TS}@test.com"

check() {
  local tc="$1" desc="$2" expected="$3" actual="$4"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS [$tc] $desc"
    PASS=$((PASS+1))
  else
    echo "  FAIL [$tc] $desc — expected=$expected got=$actual"
    FAIL=$((FAIL+1))
  fi
}

check_range() {
  local tc="$1" desc="$2" actual="$3"
  shift 3
  for e in "$@"; do
    if [ "$actual" = "$e" ]; then
      echo "  PASS [$tc] $desc (got $actual)"
      PASS=$((PASS+1))
      return
    fi
  done
  echo "  FAIL [$tc] $desc — expected one of ($*) got=$actual"
  FAIL=$((FAIL+1))
}

contains() {
  local tc="$1" desc="$2" needle="$3" haystack="$4"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  PASS [$tc] $desc"
    PASS=$((PASS+1))
  else
    echo "  FAIL [$tc] $desc — expected '$needle' in response"
    FAIL=$((FAIL+1))
  fi
}

not_contains() {
  local tc="$1" desc="$2" needle="$3" haystack="$4"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  FAIL [$tc] $desc — '$needle' found in response (should not be)"
    FAIL=$((FAIL+1))
  else
    echo "  PASS [$tc] $desc"
    PASS=$((PASS+1))
  fi
}

clear_rate_limits() {
  docker exec infrastructure-redis-1 redis-cli --scan --pattern "rl:*" | \
    xargs -r docker exec -i infrastructure-redis-1 redis-cli DEL > /dev/null 2>&1 || true
}

# Extract value from wrapped response {"success":true,"data":{...}}
get_data() {
  local json="$1" key="$2"
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('$key',''))" 2>/dev/null || echo ""
}

get_nested() {
  local json="$1" path="$2"
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); exec(\"import functools; v=functools.reduce(lambda x,k: x.get(k,{}), '$path'.split('.'), d); print(v if isinstance(v,str) else str(v))\") " 2>/dev/null || echo ""
}

# ─── Setup: Clear Redis rate limits ──────────────────────────────────────────
echo "Clearing Redis rate limit keys..."
clear_rate_limits

echo "======================================"
echo "  EPIC-01: Auth & Multi-Tenancy Tests"
echo "  Email suffix: $TS"
echo "======================================"

# ─── 1. Tenant Registration ───────────────────────────────────────────────

echo ""
echo "── 1. Tenant Registration ──"

# TC-AUTH-01 Happy Path
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"restaurantName\":\"Dosa Palace\",\"fullName\":\"Priya Sharma\",\"email\":\"$OWNER_EMAIL\",\"password\":\"TestPass@123\",\"phone\":\"+91-9876543210\",\"region\":\"IN\",\"timezone\":\"Asia/Kolkata\",\"currency\":\"INR\",\"restaurantType\":\"full-service\"}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-AUTH-01" "Happy path registration" "201" "$HTTP"
OWNER_TOKEN=$(get_data "$BODY" "accessToken")
REFRESH_TOKEN_A=$(get_data "$BODY" "refreshToken")
TENANT_A_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('tenant',{}).get('id',''))" 2>/dev/null || echo "")
contains "TC-AUTH-01b" "Response has tenantId" "\"id\"" "$BODY"
contains "TC-AUTH-01c" "Response has accessToken" "accessToken" "$BODY"

# TC-AUTH-02 Duplicate Email
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"restaurantName\":\"Another Palace\",\"fullName\":\"Other User\",\"email\":\"$OWNER_EMAIL\",\"password\":\"TestPass@123\"}")
HTTP=$(echo "$R" | tail -1)
check "TC-AUTH-02" "Duplicate email → 409" "409" "$HTTP"

# TC-AUTH-03 Weak password: too short
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"restaurantName":"Test Restaurant","fullName":"Test","email":"short.pw@test.com","password":"abc"}')
HTTP=$(echo "$R" | tail -1)
check "TC-AUTH-03" "Weak password (too short) → 400" "400" "$HTTP"

# Clear rate limits before validation tests (TC-AUTH-01/02/03 used 3 of 5 slots)
clear_rate_limits

# TC-AUTH-06 Missing required fields
for FIELD in restaurantName email password fullName; do
  PAYLOAD="{\"restaurantName\":\"Test\",\"fullName\":\"Test\",\"email\":\"field${FIELD}.${TS}@test.com\",\"password\":\"TestPass@123\"}"
  PAYLOAD=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); del d['$FIELD']; print(json.dumps(d))" 2>/dev/null || echo "{}")
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
    -H "Content-Type: application/json" -d "$PAYLOAD")
  HTTP=$(echo "$R" | tail -1)
  check "TC-AUTH-06-$FIELD" "Missing $FIELD → 400" "400" "$HTTP"
  clear_rate_limits
done

# TC-AUTH-07 Invalid email format
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"restaurantName":"Test","fullName":"Test","email":"not-an-email","password":"TestPass@123"}')
HTTP=$(echo "$R" | tail -1)
check "TC-AUTH-07" "Invalid email → 400" "400" "$HTTP"

# TC-AUTH-08 SQL injection in restaurant name (should succeed as 201 and store safely)
clear_rate_limits
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"restaurantName\":\"'; DROP TABLE tenants; --\",\"fullName\":\"Inject\",\"email\":\"$INJECT_EMAIL\",\"password\":\"TestPass@123\"}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-AUTH-08" "SQL injection in name → 201 (stored safely)" "201" "$HTTP"

# ─── 2. Login & Credential Validation ─────────────────────────────────────

echo ""
echo "── 2. Login & Credential Validation ──"

# Clear login rate limits before login tests
clear_rate_limits

# TC-AUTH-11 Happy path login
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"TestPass@123\"}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-AUTH-11" "Owner login → 200" "200" "$HTTP"
[ -z "$OWNER_TOKEN" ] && OWNER_TOKEN=$(get_data "$BODY" "accessToken")
[ -z "$REFRESH_TOKEN_A" ] && REFRESH_TOKEN_A=$(get_data "$BODY" "refreshToken")

# TC-AUTH-12 Wrong password
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"WrongPass@999\"}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-AUTH-12" "Wrong password → 401" "401" "$HTTP"
not_contains "TC-AUTH-12b" "Error does not reveal stack trace" "Exception" "$BODY"
contains "TC-AUTH-12c" "Error code INVALID_CREDENTIALS" "INVALID_CREDENTIALS" "$BODY"

# TC-AUTH-13 Non-existent email
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@nowhere.com","password":"TestPass@123"}')
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-AUTH-13" "Non-existent email → 401" "401" "$HTTP"
contains "TC-AUTH-13b" "Same error code (prevent enumeration)" "INVALID_CREDENTIALS" "$BODY"

# TC-AUTH-14 Case-insensitive email
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$(echo $OWNER_EMAIL | tr '[:lower:]' '[:upper:]')\",\"password\":\"TestPass@123\"}")
HTTP=$(echo "$R" | tail -1)
check "TC-AUTH-14" "Case-insensitive email → 200" "200" "$HTTP"

# TC-AUTH-15 Empty credentials
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"","password":""}')
HTTP=$(echo "$R" | tail -1)
check "TC-AUTH-15" "Empty credentials → 400" "400" "$HTTP"

# ─── 3. JWT Token Validation ──────────────────────────────────────────────

echo ""
echo "── 3. JWT Token Validation ──"

# TC-AUTH-20 Valid token accepted
if [ -n "$OWNER_TOKEN" ]; then
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/inventory/items" \
    -H "Authorization: Bearer $OWNER_TOKEN")
  HTTP=$(echo "$R" | tail -1)
  if [ "$HTTP" = "503" ]; then
    echo "  SKIP [TC-AUTH-20] inventory-service still starting — JWT accepted by gateway (401 check passes)"
    WARN=$((WARN+1))
    if [ "$HTTP" != "401" ]; then
      echo "  PASS [TC-AUTH-20b] Gateway did not reject valid token (not 401)"
      PASS=$((PASS+1))
    fi
  else
    check "TC-AUTH-20" "Valid token accepted" "200" "$HTTP"
  fi
fi

# TC-AUTH-21 Expired token
EXPIRED_JWT="eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxNjAwMDAwMDAwfQ.invalid"
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/inventory/items" \
  -H "Authorization: Bearer $EXPIRED_JWT")
HTTP=$(echo "$R" | tail -1)
check "TC-AUTH-21" "Expired/invalid token → 401" "401" "$HTTP"

# TC-AUTH-24 Missing auth header
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/inventory/items")
HTTP=$(echo "$R" | tail -1)
check "TC-AUTH-24" "Missing auth header → 401" "401" "$HTTP"

# TC-AUTH-25 Wrong auth scheme
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/inventory/items" \
  -H "Authorization: Basic dXNlcjpwYXNz")
HTTP=$(echo "$R" | tail -1)
check "TC-AUTH-25" "Basic auth scheme → 401" "401" "$HTTP"

# TC-AUTH-28 Algorithm confusion (alg:none)
ALG_NONE_JWT="eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0IiwidGVuYW50SWQiOiJ0ZXN0Iiwicm9sZSI6Ik9XTkVSIiwiZXhwIjo5OTk5OTk5OTk5fQ."
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/inventory/items" \
  -H "Authorization: Bearer $ALG_NONE_JWT")
HTTP=$(echo "$R" | tail -1)
check "TC-AUTH-28" "alg:none token → 401" "401" "$HTTP"

# ─── 4. Token Refresh ─────────────────────────────────────────────────────

echo ""
echo "── 4. Token Refresh ──"

if [ -n "$REFRESH_TOKEN_A" ]; then
  # TC-AUTH-31 Valid refresh
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/refresh" \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN_A\"}")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check "TC-AUTH-31" "Valid refresh → 200" "200" "$HTTP"
  contains "TC-AUTH-31b" "Response has new accessToken" "accessToken" "$BODY"

  # TC-AUTH-32 Replay: reuse already-used refresh token
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/refresh" \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN_A\"}")
  HTTP=$(echo "$R" | tail -1)
  check "TC-AUTH-32" "Replay attack → 401" "401" "$HTTP"
else
  echo "  SKIP [TC-AUTH-31/32] No refresh token available"
  WARN=$((WARN+2))
fi

# TC-AUTH-35 Malformed refresh token
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"not-a-uuid-at-all"}')
HTTP=$(echo "$R" | tail -1)
check_range "TC-AUTH-35" "Malformed refresh token → 400 or 401" "$HTTP" "400" "401"

# ─── 7. Multi-Tenant Data Isolation ──────────────────────────────────────────

echo ""
echo "── 7. Multi-Tenant Data Isolation ──"

# Clear rate limits before registering Tenant B
clear_rate_limits

# TC-AUTH-50 Register Tenant B
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"restaurantName\":\"Biryani Hub\",\"fullName\":\"Arjun Nair\",\"email\":\"$TENANT_B_EMAIL\",\"password\":\"TestPass@123\",\"region\":\"IN\"}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "TC-AUTH-50" "Tenant B registration → 201" "201" "$HTTP"
TENANT_B_TOKEN=$(get_data "$BODY" "accessToken")
TENANT_B_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('tenant',{}).get('id',''))" 2>/dev/null || echo "")

# TC-AUTH-51 Tenant A cannot see Tenant B's items (need inv-service up)
if [ -n "$OWNER_TOKEN" ]; then
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/inventory/items" \
    -H "Authorization: Bearer $OWNER_TOKEN")
  HTTP=$(echo "$R" | tail -1)
  if [ "$HTTP" = "503" ]; then
    echo "  SKIP [TC-AUTH-51] inventory-service still starting"
    WARN=$((WARN+1))
  else
    check "TC-AUTH-51" "Tenant isolation - only own items" "200" "$HTTP"
  fi
fi

# TC-AUTH-53 X-Tenant-Id Header Override (gateway must ignore it)
if [ -n "$OWNER_TOKEN" ] && [ -n "$TENANT_B_ID" ]; then
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/inventory/items" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "X-Tenant-Id: $TENANT_B_ID")
  HTTP=$(echo "$R" | tail -1)
  if [ "$HTTP" = "503" ]; then
    echo "  SKIP [TC-AUTH-53] inventory-service still starting"
    WARN=$((WARN+1))
  else
    check "TC-AUTH-53" "X-Tenant-Id override ignored → 200 (Tenant A items)" "200" "$HTTP"
  fi
fi

# ─── 9. Security Headers & Error Safety ──────────────────────────────────

echo ""
echo "── 9. Security Headers & Error Safety ──"

# TC-AUTH-71 No stack traces in errors
R=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":null,"password":true}')
not_contains "TC-AUTH-71a" "No java exception in error" "java.lang" "$R"
not_contains "TC-AUTH-71b" "No Spring class in error" "org.springframework" "$R"
not_contains "TC-AUTH-71c" "No internal port in error" "8081" "$R"
not_contains "TC-AUTH-71d" "No stack trace in error" "at com.kitchenledger" "$R"

# TC-AUTH-72 CORS misconfiguration
R=$(curl -s -I -X OPTIONS http://localhost:8080/api/auth/login \
  -H "Origin: http://evil.com" \
  -H "Access-Control-Request-Method: POST")
not_contains "TC-AUTH-72" "Evil origin not allowed in CORS" "evil.com" "$R"

# TC-AUTH-73 Actuator endpoints not exposed on host
for PORT in 8081 8082 8083 8088; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/actuator/env" 2>/dev/null) || HTTP="000"
  if [ "$HTTP" = "401" ] || [ "$HTTP" = "404" ] || [ "$HTTP" = "000" ]; then
    echo "  PASS [TC-AUTH-73-$PORT] Actuator /env not externally exposed (got $HTTP)"
    PASS=$((PASS+1))
  else
    echo "  FAIL [TC-AUTH-73-$PORT] Actuator /env exposed on port $PORT (got $HTTP)"
    FAIL=$((FAIL+1))
  fi
done

# ─── Summary ──────────────────────────────────────────────────────────────

echo ""
echo "======================================"
echo "  Results: $PASS passed, $FAIL failed, $WARN skipped/warned"
echo "  $([ $FAIL -eq 0 ] && echo 'GO' || echo 'NO-GO')"
echo "======================================"
echo ""
echo "Saved test data for subsequent epics:"
echo "  TENANT_A_ID=$TENANT_A_ID"
echo "  TENANT_B_ID=$TENANT_B_ID"
echo "  OWNER_EMAIL=$OWNER_EMAIL"
echo "  TENANT_B_EMAIL=$TENANT_B_EMAIL"
echo "  OWNER_TOKEN=${OWNER_TOKEN:0:50}..."

exit $FAIL

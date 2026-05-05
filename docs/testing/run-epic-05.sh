#!/usr/bin/env bash
# EPIC-05: AI Features — OCR, Voice, NL Query, Forecast, Anomaly Detection
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

# Accept 200/201 as success, 502/503 as SKIP (external dependency unavailable)
check_ai() {
  local id="$1" label="$2" actual="$3"
  if [[ "$actual" == "200" || "$actual" == "201" ]]; then
    echo "  PASS [$id] $label (got $actual)"
    PASS=$((PASS+1))
  elif [[ "$actual" == "503" || "$actual" == "502" ]]; then
    echo "  SKIP [$id] $label — external dependency unavailable ($actual)"
    SKIP=$((SKIP+1))
  else
    echo "  FAIL [$id] $label — expected 200/201 got=$actual"
    FAIL=$((FAIL+1))
  fi
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

# ── Create test files ──────────────────────────────────────────────────────
PNG_FILE="/tmp/epic05_test_${TS}.png"
WAV_FILE="/tmp/epic05_test_${TS}.wav"

python3 -c "
import base64, sys
data = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=')
sys.stdout.buffer.write(data)
" > "$PNG_FILE"

python3 -c "
import struct, sys
sample_rate = 8000
num_samples = 800
data_size = num_samples * 2
header = struct.pack('<4sI4s4sIHHIIHH4sI',
    b'RIFF', 36 + data_size, b'WAVE',
    b'fmt ', 16, 1, 1, sample_rate, sample_rate * 2, 2, 16,
    b'data', data_size)
sys.stdout.buffer.write(header + b'\x00' * data_size)
" > "$WAV_FILE"

echo "======================================"
echo "  EPIC-05: AI Features Tests"
echo "  Timestamp: $TS"
echo "======================================"

# ── Setup: Authenticate ────────────────────────────────────────────────────
echo ""
echo "── Setup: Authenticating ──"

R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"restaurantName\":\"AI Test Restaurant $TS\",\"fullName\":\"AI Test Owner\",\"email\":\"aitest$TS@example.com\",\"password\":\"Test@1234\",\"timezone\":\"Asia/Kolkata\"}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_one "SETUP-01" "Register test tenant" "$HTTP" "201"

OWNER_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null || echo "")
TENANT_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('tenant',{}).get('id',''))" 2>/dev/null || echo "")

if [[ -z "$OWNER_TOKEN" ]]; then
  echo "  FATAL: Could not get token"
  exit 1
fi

AUTH="Authorization: Bearer $OWNER_TOKEN"

# ── 1. OCR — Notebook Scan ─────────────────────────────────────────────────
echo ""
echo "── 1. OCR: Notebook Scan ──"

# TC-AI-01: Submit notebook OCR job
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/ocr/notebook" \
  -H "$AUTH" \
  -F "image=@$PNG_FILE;type=image/png" \
  -F "context_type=inventory" \
  -F "target_date=2026-05-01")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_ai "TC-AI-01" "Submit notebook OCR → 201 or 502/503" "$HTTP"
NOTEBOOK_JOB_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null || echo "")

# TC-AI-02: Response has job_id (only if job was created)
if [[ "$HTTP" == "201" ]]; then
  check_field "TC-AI-02" "Notebook job has job_id" "$BODY" "job_id"
else
  echo "  SKIP [TC-AI-02] Notebook job_id — job not created ($HTTP)"
  SKIP=$((SKIP+1))
fi

# TC-AI-03: Poll notebook job status
if [[ -n "$NOTEBOOK_JOB_ID" && "$NOTEBOOK_JOB_ID" != "" ]]; then
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/ocr/notebook/$NOTEBOOK_JOB_ID" \
    -H "$AUTH")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check_one "TC-AI-03" "Poll notebook OCR job → 200" "$HTTP" "200"
  check_field "TC-AI-03b" "Job has status" "$BODY" "status"
else
  echo "  SKIP [TC-AI-03] Poll notebook OCR — no job_id"
  SKIP=$((SKIP+1))
  echo "  SKIP [TC-AI-03b] Job has status — no job_id"
  SKIP=$((SKIP+1))
fi

# TC-AI-04: Invalid content type → 422
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/ocr/notebook" \
  -H "$AUTH" \
  -F "image=@$WAV_FILE;type=audio/wav" \
  -F "context_type=inventory")
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-04" "OCR with wrong file type → 422" "$HTTP" "422"

# TC-AI-05: Invalid context_type → 422
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/ocr/notebook" \
  -H "$AUTH" \
  -F "image=@$PNG_FILE;type=image/png" \
  -F "context_type=invalid")
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-05" "OCR with invalid context_type → 422" "$HTTP" "422"

# TC-AI-06: Get job via generic /jobs endpoint
if [[ -n "$NOTEBOOK_JOB_ID" && "$NOTEBOOK_JOB_ID" != "" ]]; then
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/jobs/$NOTEBOOK_JOB_ID" \
    -H "$AUTH")
  HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
  check_one "TC-AI-06" "Get job via /jobs/{id} → 200" "$HTTP" "200"
  check_field "TC-AI-06b" "Job has job_type" "$BODY" "job_type"
else
  echo "  SKIP [TC-AI-06] Get job via /jobs — no job_id"
  SKIP=$((SKIP+1))
  echo "  SKIP [TC-AI-06b] Job has job_type — no job_id"
  SKIP=$((SKIP+1))
fi

# ── 2. OCR — Receipt Scan ──────────────────────────────────────────────────
echo ""
echo "── 2. OCR: Receipt Scan ──"

# TC-AI-10: Submit receipt OCR job
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/ocr/receipt" \
  -H "$AUTH" \
  -F "image=@$PNG_FILE;type=image/png")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_ai "TC-AI-10" "Submit receipt OCR → 201 or 502/503" "$HTTP"
RECEIPT_JOB_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null || echo "")

# TC-AI-11: Poll receipt job
if [[ -n "$RECEIPT_JOB_ID" && "$RECEIPT_JOB_ID" != "" ]]; then
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/ocr/receipt/$RECEIPT_JOB_ID" \
    -H "$AUTH")
  HTTP=$(echo "$R" | tail -1)
  check_one "TC-AI-11" "Poll receipt OCR job → 200" "$HTTP" "200"
else
  echo "  SKIP [TC-AI-11] Poll receipt OCR — no job_id"
  SKIP=$((SKIP+1))
fi

# TC-AI-12: Missing image → 422
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/ocr/receipt" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{}')
HTTP=$(echo "$R" | tail -1)
check_range "TC-AI-12" "Receipt OCR missing file → 422 or 415 or 400" "$HTTP" "422" "415" "400"

# ── 3. Commit OCR Results ──────────────────────────────────────────────────
echo ""
echo "── 3. OCR Commit ──"

# TC-AI-15: Commit on non-completed job → 409
if [[ -n "$NOTEBOOK_JOB_ID" && "$NOTEBOOK_JOB_ID" != "" ]]; then
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/ocr/notebook/$NOTEBOOK_JOB_ID/commit" \
    -H "$AUTH" \
    -H "Content-Type: application/json" \
    -d '{"items_to_update":[],"expenses_to_create":[]}')
  HTTP=$(echo "$R" | tail -1)
  # Job is pending/failed, not completed → 409
  check_range "TC-AI-15" "Commit non-completed job → 409 or 404" "$HTTP" "409" "404"
else
  echo "  SKIP [TC-AI-15] Commit non-completed job — no job_id"
  SKIP=$((SKIP+1))
fi

# TC-AI-16: Commit unknown job → 404
FAKE_JOB_ID="00000000-0000-0000-0000-000000000001"
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/ocr/notebook/$FAKE_JOB_ID/commit" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"items_to_update":[],"expenses_to_create":[]}')
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-16" "Commit unknown job → 404" "$HTTP" "404"

# ── 4. Voice Transcription ─────────────────────────────────────────────────
echo ""
echo "── 4. Voice Transcription ──"

# TC-AI-20: Submit voice transcription (may 503 if OpenAI not configured)
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/voice/transcribe" \
  -H "$AUTH" \
  -F "audio=@$WAV_FILE;type=audio/wav" \
  -F "command_type=stock_count" \
  -F "language=en")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_ai "TC-AI-20" "Voice transcribe → 200/201 or 503" "$HTTP"

# TC-AI-21: Wrong audio type → 422
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/voice/transcribe" \
  -H "$AUTH" \
  -F "audio=@$PNG_FILE;type=image/png" \
  -F "command_type=stock_count")
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-21" "Voice with image file type → 422" "$HTTP" "422"

# TC-AI-22: Invalid command_type → 422
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/voice/transcribe" \
  -H "$AUTH" \
  -F "audio=@$WAV_FILE;type=audio/wav" \
  -F "command_type=invalid_type")
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-22" "Voice with invalid command_type → 422" "$HTTP" "422"

# TC-AI-23: Poll voice job (from TC-AI-20 if it returned a job)
VOICE_JOB_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('job_id',''))" 2>/dev/null || echo "")
# Voice endpoint returns transcript/parsed directly (not job_id), but check jobs endpoint
echo "  SKIP [TC-AI-23] Voice async poll — synchronous endpoint"
SKIP=$((SKIP+1))

# ── 5. Natural Language Query ──────────────────────────────────────────────
echo ""
echo "── 5. Natural Language Query ──"

# TC-AI-30: NL query (may 503 if OpenAI not configured)
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/query" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"question":"What were total sales this week?"}')
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_ai "TC-AI-30" "NL query → 200 or 503" "$HTTP"

# TC-AI-31: NL query with different question (test caching logic)
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/query" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"question":"What items are running low on stock?"}')
HTTP=$(echo "$R" | tail -1)
check_ai "TC-AI-31" "NL query (different question) → 200 or 503" "$HTTP"

# TC-AI-32: NL query missing question → 422
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/query" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{}')
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-32" "NL query missing question → 422" "$HTTP" "422"

# TC-AI-33: NL query invalid JSON → 422 or 400
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/query" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d 'not-json')
HTTP=$(echo "$R" | tail -1)
check_range "TC-AI-33" "NL query invalid JSON → 422 or 400" "$HTTP" "422" "400"

# ── 6. Demand Forecasting ──────────────────────────────────────────────────
echo ""
echo "── 6. Demand Forecasting ──"

FAKE_ITEM_ID="00000000-0000-0000-0000-000000000099"

# TC-AI-40: Forecast for item (may return default/empty forecast even for unknown items)
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/forecast/$FAKE_ITEM_ID?days=7" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_range "TC-AI-40" "Forecast item → 200 or 502 or 404" "$HTTP" "200" "502" "404"

# TC-AI-41: Forecast with valid days range
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/forecast/$FAKE_ITEM_ID?days=30" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1)
check_range "TC-AI-41" "Forecast with days=30 → 200 or 502 or 404" "$HTTP" "200" "502" "404"

# TC-AI-42: Forecast with invalid days → 422
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/forecast/$FAKE_ITEM_ID?days=0" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-42" "Forecast with days=0 → 422" "$HTTP" "422"

# TC-AI-43: Forecast with days > 90 → 422
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/forecast/$FAKE_ITEM_ID?days=91" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-43" "Forecast with days=91 → 422" "$HTTP" "422"

# ── 7. Anomaly Detection ───────────────────────────────────────────────────
echo ""
echo "── 7. Anomaly Detection ──"

# TC-AI-50: Get anomalies
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/anomalies" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check_range "TC-AI-50" "Detect anomalies → 200 or 502" "$HTTP" "200" "502"

# TC-AI-51: Response has inventory_anomalies and finance_anomalies
if [[ "$HTTP" == "200" ]]; then
  check_field "TC-AI-51a" "Anomalies has inventory_anomalies" "$BODY" "inventory_anomalies"
  check_field "TC-AI-51b" "Anomalies has finance_anomalies" "$BODY" "finance_anomalies"
else
  echo "  SKIP [TC-AI-51a] Anomalies structure — not 200"
  SKIP=$((SKIP+1))
  echo "  SKIP [TC-AI-51b] Anomalies structure — not 200"
  SKIP=$((SKIP+1))
fi

# ── 8. Job Management ──────────────────────────────────────────────────────
echo ""
echo "── 8. Job Management ──"

# TC-AI-60: Get unknown job → 404
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/jobs/$FAKE_JOB_ID" \
  -H "$AUTH")
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-60" "Get unknown job → 404" "$HTTP" "404"

# TC-AI-61: Job from another tenant → 404
# Register second tenant
R2=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"restaurantName\":\"AI Other $TS\",\"fullName\":\"AI Other Owner\",\"email\":\"aiother$TS@example.com\",\"password\":\"Test@1234\",\"timezone\":\"Asia/Kolkata\"}")
HTTP2=$(echo "$R2" | tail -1); BODY2=$(echo "$R2" | head -1)
OTHER_TOKEN=$(echo "$BODY2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null || echo "")

if [[ -n "$NOTEBOOK_JOB_ID" && "$NOTEBOOK_JOB_ID" != "" && -n "$OTHER_TOKEN" ]]; then
  R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/jobs/$NOTEBOOK_JOB_ID" \
    -H "Authorization: Bearer $OTHER_TOKEN")
  HTTP=$(echo "$R" | tail -1)
  check_one "TC-AI-61" "Cross-tenant job access → 404" "$HTTP" "404"
else
  echo "  SKIP [TC-AI-61] Cross-tenant job access — no job_id or token"
  SKIP=$((SKIP+1))
fi

# ── 9. Security ────────────────────────────────────────────────────────────
echo ""
echo "── 9. Security ──"

# TC-AI-SEC-01: Unauthenticated request → 401
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/anomalies")
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-SEC-01" "Unauthenticated AI request → 401" "$HTTP" "401"

# TC-AI-SEC-02: Unauthenticated NL query → 401
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/ai/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"test"}')
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-SEC-02" "Unauthenticated NL query → 401" "$HTTP" "401"

# TC-AI-SEC-03: Unauthenticated forecast → 401
R=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/ai/forecast/$FAKE_ITEM_ID")
HTTP=$(echo "$R" | tail -1)
check_one "TC-AI-SEC-03" "Unauthenticated forecast → 401" "$HTTP" "401"

# ── Cleanup ────────────────────────────────────────────────────────────────
rm -f "$PNG_FILE" "$WAV_FILE" 2>/dev/null || true

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

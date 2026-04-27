---
name: e2e-run
description: Use to run E2E tests after the environment is confirmed ready. Runs e2e_verify.py and Flutter integration tests on the Android emulator. Called by /e2e-test automatically after /e2e-env-check passes.
argument-hint: "optional: flow name e.g. 'workout-flow' or 'auth'"
disable-model-invocation: true
---

## What This Skill Does

Runs the actual E2E test suites: API-level via `e2e_verify.py`, and Flutter integration tests on the connected emulator. Scoped to `$ARGUMENTS` if a specific flow is provided. Returns raw test output for `/e2e-analyze`.

**Prerequisite:** `/e2e-env-check` must have passed. Do not run this if the environment is not ready.

---

## Step 1 — Determine scope

If `$ARGUMENTS` names a specific flow (e.g., `workout-flow`, `auth`, `medical-upload`):
- Only run tests related to that flow
- For API E2E: note which endpoints to verify from the flow
- For Flutter: look for integration tests matching that flow name

If no `$ARGUMENTS` → run full suite.

---

## Step 2 — API E2E (`e2e_verify.py`)

```bash
python3 e2e_verify.py 2>&1
```

Capture full output. The script tests:
- Backend + AI service health
- User registration and auth
- Workout logging
- `/api/health-summary/me`
- `/api/health-summary/me/ai-insights`

---

## Step 3 — Flutter Integration Tests

Check if integration tests exist:
```bash
ls mobile/integration_test/ 2>/dev/null || echo "MISSING"
```

If present, get the connected emulator device ID:
```bash
flutter devices 2>/dev/null | grep emulator | head -1
```

Run integration tests:
```bash
cd mobile && flutter test integration_test/ -d [emulator-device-id] 2>&1
```

If `integration_test/` is missing: note as a coverage gap. Do not fail — continue with what exists.

---

## Step 4 — Return raw results

Output the full, untruncated results:

```
## E2E Test Raw Output

### API E2E (e2e_verify.py)
[full stdout]

### Flutter Integration Tests
[full stdout or "Not run: [reason]"]

### Scope tested
$ARGUMENTS [or "Full suite"]
```

Do not analyse results here — pass raw output to `/e2e-analyze`.

## Learnings
End every response with:
- **Gap:** [anything missing you had to improvise]
- **Improvement:** [what to add to this sub-skill]
- **Pattern:** [recurring test run issue]
If nothing: `## Learnings — nothing to report this run.`

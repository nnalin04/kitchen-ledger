---
name: qa-report
description: Use when someone asks for a QA report, full test run, quality check, test results, or whether the project is ready to release.
disable-model-invocation: true
---

## What This Skill Does

Runs the complete automated test suite against local Docker services via the master runner script, then produces a structured GO/NO-GO QA report.

## Steps

### 1. Run the master test runner

```bash
bash scripts/run_dev_tests.sh 2>&1
```

This single command:
- Starts local Docker services (builds if needed, waits for health checks)
- Runs all 4 layers: backend unit tests, AI service offline tests, backend E2E API tests (~60 test cases across all 33 endpoints), Flutter unit tests
- Prints per-layer PASS/FAIL and a final GO/NO-GO verdict

Capture the full output. Exit code 0 = GO, exit code 1 = NO-GO.

If Docker is not running or `env.dev` is missing, report as a setup issue, not a test failure.

### 2. Parse quick stats

From the output, extract:
- Per-layer result (PASS/FAIL)
- Total tests passed / failed / errored
- Names of any failing tests

### 3. Spawn qa-tester agent for full analysis

Pass all test output to the `qa-tester` agent:

```
You are performing a QA review for the Personal Health Coach system.

## Test Results (from scripts/run_dev_tests.sh)

[full run_dev_tests.sh output]

## Instructions
1. Produce the QA Report: Results Summary table, Failures detail, Coverage Gaps, Quality Gate Status.
2. For each failure: identify the root cause and suggest a fix.
3. Identify the top 3 remaining coverage gaps.
4. End with a clear GO / NO-GO recommendation with justification.
```

### 4. Present to user

Show the qa-tester agent's full report. Add a one-line summary at the top:

> "QA Report: Backend [Pass/Fail], AI Service [Pass/Fail], E2E API [Pass/Fail], Mobile [Pass/Fail] — Recommendation: GO / NO-GO"

## Notes

- `API_BASE_URL` env var overrides the default `http://localhost:8080/api`
- E2E Prod tests (`python3 e2e_prod_test.py`) are for UAT/GCP only — run separately
- If a test runner is missing (mvn, pytest, flutter), report it as a setup issue
- Never modify source code — only run and report

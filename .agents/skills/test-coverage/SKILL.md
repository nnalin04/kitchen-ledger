---
name: test-coverage
description: Use when someone asks about test coverage, what's tested, what's missing tests, how well the code is tested, or wants a coverage analysis.
---

## Task

Analyse test coverage for the Personal Health Coach system. Do NOT run tests — only analyse what test files exist and what they cover.

## Context to gather

**Backend test files:**
!`find backend/src/test -name "*.java" -type f 2>/dev/null | sort`

**Backend source files (to compare against tests):**
!`find backend/src/main -name "*.java" -type f | grep -E "(Controller|Service|Repository)" | sort`

**AI service test files:**
!`find ai-service -name "test_*.py" -o -name "*_test.py" 2>/dev/null | sort`

**AI service source files:**
!`find ai-service/app -name "*.py" -not -name "__init__.py" | sort`

**Mobile test files:**
!`find mobile/test -name "*_test.dart" 2>/dev/null | sort`

**Mobile feature screens (to compare against tests):**
!`find mobile/lib/features -name "*.dart" | sort`

**E2E test script:**
!`cat e2e_verify.py`

## Analysis to produce

Using the file lists above, produce a coverage analysis:

### 1. Coverage Matrix

For each layer, build a table:

**Backend:**
```
| Class | Test Exists? | Notes |
|-------|-------------|-------|
| AuthController | ✅ / ❌ | |
| WorkoutService | ✅ / ❌ | |
| ... | | |
```

Infer test existence by matching class names: e.g. `WorkoutService.java` → look for `WorkoutServiceTest.java`

**AI Service:**
```
| Router/Service | Test Exists? | Notes |
|---|---|---|
| health_router | ✅ / ❌ | |
| ...| | |
```

**Mobile:**
```
| Screen/Feature | Test Exists? | Notes |
|---|---|---|
| LoginScreen | ✅ / ❌ | |
| ... | | |
```

### 2. Critical Gaps

List untested components, prioritised by risk:

```
## ❌ Critical Coverage Gaps (test these first)

1. **[Class/File]** — [Why this is high-risk if untested]
   Suggested test: [specific test case description]

2. ...
```

Prioritise: auth flows, medical data handling, AI service error paths, payment/PII data.

### 3. Coverage Score (estimated)

```
| Layer | Files | With Tests | Coverage % |
|-------|-------|-----------|------------|
| Backend | N | N | ~% |
| AI Service | N | N | ~% |
| Mobile | N | N | ~% |
| Overall | | | ~% |
```

### 4. Top 5 Tests to Write Next

List the 5 highest-value tests that don't exist yet, with enough detail for a developer to implement them:

```
1. **[TestClassName]** (`backend/src/test/...`)
   - Test: [what scenario]
   - Assert: [what to verify]
   - Mock: [what to stub out]
```

End with: "To improve from ~X% to ~Y% coverage, focus on: [3 specific areas]."

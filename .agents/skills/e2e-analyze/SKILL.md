---
name: e2e-analyze
description: Use to analyse E2E test results, identify bugs, route them to the right engineers, and produce a GO/NO-GO verdict. Called by /e2e-test automatically after /e2e-run completes.
disable-model-invocation: true
---

## What This Skill Does

Takes raw E2E test output and spawns the `qa-tester` agent to analyse results, document bugs, and produce a GO/NO-GO verdict. Bug fixes are routed back through the PM (main context) to the `reviewer` agent for diagnosis and implementation.

**Input:** Raw output from `/e2e-run` (passed as context or in `$ARGUMENTS`).

---

## Step 1 — Spawn qa-tester agent

```
You are analysing E2E test results for the Personal Health Coach system.

## Raw Test Output
$ARGUMENTS
[or: the test output passed into context]

## Instructions
1. Parse both the API E2E and Flutter integration test outputs.
2. Produce a QA report in your standard format (Results Summary table, Failures detail, Coverage Gaps).
3. For each failure: assign severity (Critical/High/Medium/Low) and identify which layer it belongs to
   (backend = Java/Spring Boot, mobile = Flutter/Dart, AI service = Python/FastAPI).
4. List escalations: which bugs go to which layer (so the reviewer knows which domain to activate).
5. Note any missing integration tests as coverage gaps.
6. End with a clear GO / NO-GO verdict with justification.
7. Append your ## Learnings block as required by the self-improvement protocol.
```

Collect the full QA report.

---

## Step 2 — Route bugs for fixing

If the QA report contains any bugs, hand off to the main PM context:

For each Critical or High bug, spawn the `reviewer` agent with the failing test output and the relevant source files:

```
You are diagnosing a bug found during E2E testing for the Personal Health Coach project.

## Bug
[title, severity, layer, error output from test]

## Relevant Files
[source files for the affected layer]

## Instructions
1. Identify the root cause.
2. Propose the exact fix (file + line + change).
3. Activate only the domain relevant to this bug (Backend / Mobile / AI Service).
4. Output a Findings report with the proposed fix clearly stated.
```

After reviewer diagnoses, implement the fix in the main context.

---

## Step 3 — Final E2E Report

```
# E2E Test Report — [date]

## Results
| Suite | Run | Pass | Fail | Status |
|-------|-----|------|------|--------|
| API E2E | | | | |
| Flutter Integration | | | | |

## Bugs Found: [N]
[title | severity | layer | fix applied / still open]

## Coverage Gaps
[flows with no integration test coverage]

## Verdict: GO ✅ / NO-GO ❌
[reason — what must be fixed before release]
```

## Learnings
End every response with:
- **Gap:** [anything missing you had to improvise]
- **Improvement:** [what to add to this sub-skill]
- **Pattern:** [recurring analysis pattern]
If nothing: `## Learnings — nothing to report this run.`

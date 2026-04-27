---
name: e2e-test
description: Use when running the Flutter/Android end-to-end test pipeline (env-check → run → analyze). Orchestrates 3 sub-skills across emulator + API layers. For Playwright web E2E patterns, use `/e2e-testing` instead.
argument-hint: "optional: flow name e.g. 'workout-flow' | or phase: 'env-check' | 'run' | 'analyze'"
disable-model-invocation: true
---

## What This Skill Does

Orchestrates the full E2E test cycle by sequentially delegating to three focused sub-skills. Each sub-skill is small, single-purpose, and loads only what it needs.

| Sub-skill | Phase | Does |
|-----------|-------|------|
| `/e2e-env-check` | 1 — Environment | Verifies services + emulator + build. Calls DevOps if services are down. |
| `/e2e-run [flow]` | 2 — Execute | Runs `e2e_verify.py` + Flutter integration tests. |
| `/e2e-analyze` | 3 — Analyse | qa-tester reviews results, routes bugs via project-manager. |

## Routing

Determine mode from `$ARGUMENTS`:

- `env-check` → invoke only `/e2e-env-check`
- `run [flow]` → invoke only `/e2e-run [flow]`
- `analyze` → invoke only `/e2e-analyze`
- any flow name (e.g. `workout-flow`) → full pipeline, pass flow name to `/e2e-run`
- no argument → full pipeline, no scope filter

## Full Pipeline

1. Invoke `/e2e-env-check`
   - If result is BLOCKED → stop. Report the blocker to the user. Do NOT continue to Phase 2.
2. Invoke `/e2e-run $ARGUMENTS` (pass the flow argument if provided)
3. Pass the raw output from `/e2e-run` to `/e2e-analyze`

## Notes

- Run a single phase by using its sub-skill directly: `/e2e-env-check`, `/e2e-run`, `/e2e-analyze`
- This router is intentionally minimal — all logic lives in the sub-skills
- If `/e2e-env-check` triggers a DevOps deployment, wait for it to complete before invoking `/e2e-run`

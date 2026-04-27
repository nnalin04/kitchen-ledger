---
name: pm
description: Use when someone wants to start any work, assign a task, get something done, report an issue, request a feature, or needs help deciding what to do next. The PM skill is the single entry point that routes ALL work.
argument-hint: "describe what needs to be done"
disable-model-invocation: true
---

## What This Skill Does

The PM skill turns the current Codex context into the project manager. No separate PM agent is spawned — Codex IS the PM. This skill gathers context, then applies PM-mode thinking to plan, delegate to specialists, and coordinate the full workflow.

**Use this for:** features, bugs, deployments, testing, design reviews, security checks, new capabilities, sprint planning, or anything where you're not sure who should handle it.

## Steps

### 1. Gather context

!`git log --oneline -10`
!`git status --short`
!`ls .Codex/agents/ | sed 's/\.md//'`
!`grep -c "\[ \]" PROJECT_TODO.md 2>/dev/null || echo "0"`

### 2. Act as PM — analyse and plan

Using the context gathered and `$ARGUMENTS`, act as project manager:

1. **Classify** the request: feature / bug / deployment / test / design review / security / infra / planning.
2. **Build an execution plan** — numbered steps, stating which agents are needed and in what order (sequential or parallel).
3. **Present the plan** clearly before starting execution.
4. **Execute** — delegate to the appropriate agents using the Agent tool. Available agents: `reviewer`, `qa-tester`, `security-engineer`, `devops-engineer`.
5. **Synthesise** all agent outputs into a final completion summary.
6. **Update PROJECT_TODO.md** if tasks are completed or new items are identified.
7. **If a new role is needed** that none of the 4 agents cover, invoke `/build-agent [role]` before proceeding.

### 3. PM routing guide

| Request type | Primary agent(s) |
|---|---|
| Code review, PR review | `reviewer` |
| UX / design audit | `reviewer` (UX/Mobile domains) |
| Bug in backend or mobile | `reviewer` to diagnose → fix in main context |
| E2E / integration testing | `qa-tester` via `/e2e-test` |
| Security audit | `security-engineer` |
| Deployment, GCP, infra | `devops-engineer` |
| PRD / product spec | `/prd` skill |
| New agent needed | `/build-agent` skill |

### 4. Completion report

After all work is done, present:
- Which agents were involved and what each produced
- What is done vs still open
- Recommended next actions

## Notes

- If `$ARGUMENTS` is empty, ask: "What would you like to work on? Describe the task, bug, or request."
- Parallel agents where tasks are independent; sequential when one depends on another's output.
- Everything delegated is tracked and reported back — nothing is silently dropped.

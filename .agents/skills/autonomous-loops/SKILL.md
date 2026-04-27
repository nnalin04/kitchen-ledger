---
name: autonomous-loops
description: Patterns for autonomous Codex loops — from simple sequential pipelines to multi-agent RFC-driven systems. Use when automating repetitive tasks, running continuous PR loops, or building agentic workflows.
origin: ECC
---

# Autonomous Loops

Six patterns for increasingly sophisticated autonomous Codex loops.

## Pattern 1: Sequential Pipeline

Best for: deterministic transformations, data processing, format conversions.

```bash
Codex -p "analyze requirements in spec.md, output JSON" > analysis.json
Codex -p "given analysis.json, generate implementation plan" > plan.md
Codex -p "implement plan.md, write to src/"
```

Stop conditions: explicit error, output missing, non-zero exit.

## Pattern 2: NanoClaw REPL

Persistent session-aware loop with shared context:

```bash
# Start persistent session
Codex --session my-session -p "initialize: read AGENTS.md and project state"

# Subsequent turns reuse context
Codex --session my-session -p "next task: implement feature X"
Codex --session my-session -p "next task: write tests for X"
```

Use `/claw` command to invoke if configured.

## Pattern 3: Infinite Agentic Loop

For continuous task processing:

```bash
while true; do
  TASK=$(Codex -p "check .Codex/tasks.json, return next pending task as JSON or 'DONE'")
  [ "$TASK" = "DONE" ] && break
  Codex -p "process task: $TASK, mark complete when done"
  sleep 5
done
```

**Required stop conditions**: explicit DONE signal, max_iterations, budget_exceeded flag.

## Pattern 4: Continuous PR Loop

For automated PR review/fix cycles:

```bash
gh pr list --json number,title | Codex -p "pick highest priority PR needing review"
# For each PR:
gh pr checkout $PR_NUM
Codex -p "review and fix all issues in this PR branch"
gh pr push && gh pr review --approve
```

Stop when: queue empty, merge conflict detected, or consecutive failures > 3.

## Pattern 5: De-Sloppify Pass

Separate cleanup pass after TDD implementation to remove type-testing slop and over-engineering:

```bash
# After initial implementation:
Codex -p "review all new files for: unnecessary type assertions, over-abstracted utilities,
           commented-out code, TODO comments, console.log statements. Fix each one."
```

Run this as a mandatory post-implementation step before committing.

## Pattern 6: RFC-Driven DAG

For complex multi-feature development with a merge queue:

```
RFC document → decompose into task DAG → parallel agent execution → merge queue
```

```bash
# Generate task DAG from RFC
Codex -p "parse RFC.md, output task-dag.json with dependencies"

# Execute parallel tracks
Codex --worktree feat/auth -p "implement task auth-service" &
Codex --worktree feat/api -p "implement task api-gateway" &
wait

# Sequential merge queue
for branch in feat/auth feat/api; do
  git merge $branch && Codex -p "run quality gates"
done
```

## Safety Rules (All Patterns)

1. **Always define stop conditions** before starting — never open-ended loops
2. **Budget guard**: track estimated token spend, halt at 80% of budget
3. **Failure ceiling**: halt if consecutive_failures > 3
4. **Worktree isolation**: use `--worktree` or separate branches for parallel work
5. **Checkpoint logging**: write progress to `.Codex/loop-state.jsonl` each iteration
6. **Use `loop-operator` agent** to monitor long-running loops

## Loop State Schema

```json
{
  "timestamp": "ISO-8601",
  "iteration": 5,
  "status": "success|failure|paused",
  "task": "task description",
  "consecutive_failures": 0,
  "tokens_used": 12500
}
```

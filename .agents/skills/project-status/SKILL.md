---
name: project-status
description: Use when someone asks for a project status update, how the project is going, what's done and what's pending, project health, or progress report.
---

## Task

Generate a full project status report for the Personal Health Coach system.

## Context to gather

Read these before writing the report:

**Task backlog:**
!`cat PROJECT_TODO.md`

**Recent git activity (last 14 days):**
!`git log --oneline --since="14 days ago"`

**Current branch and uncommitted work:**
!`git status --short`

**Files changed recently (for velocity analysis):**
!`git log --oneline --name-only --since="7 days ago" | head -60`

## Report to produce

Using the context above, produce a full status report in your standard output format:

1. **Overall Health** — 🟢 On Track / 🟡 At Risk / 🔴 Blocked, with one-sentence justification
2. **Progress by Section** — table of Done vs Pending per PROJECT_TODO.md section
3. **Velocity** — what was actually shipped in the last 7 days (from git log, not from the TODO)
4. **Top Risks** — up to 3 risks with impact and mitigation
5. **Recommended Next Actions** — top 5 pending tasks, assigned to the right domain, with size estimate

Be specific. Reference actual TODO items and actual commit messages. Do not pad with generic advice.

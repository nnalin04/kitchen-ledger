---
name: standup
description: Use when someone asks for a standup, daily standup report, what was done yesterday, what's planned today, or team status update.
---

## Task

Generate a concise daily standup report for the Personal Health Coach project.

## Context to gather

**Yesterday's commits (last 24 hours):**
!`git log --oneline --since="24 hours ago" --all`

**Last 3 days if yesterday was a weekend or nothing shipped:**
!`git log --oneline --since="72 hours ago" --all`

**Current branch:**
!`git branch --show-current`

**Uncommitted changes (in-progress work):**
!`git status --short`

**Pending tasks (top of backlog):**
!`grep -n "\[ \]" PROJECT_TODO.md | head -20`

## Standup to produce

```
# Daily Standup — [today's date]

## ✅ Yesterday
[List what was actually committed from git log. Be specific — reference feature names and file areas changed. If nothing committed, say "No commits — work in progress (see uncommitted changes below)."]

## 🔨 Uncommitted / In Progress
[From git status — what's being worked on right now]

## 📋 Today (Recommended)
[Top 3 tasks from the pending backlog, matched to the right skill domain. Keep it realistic — one per domain max.]

## 🚧 Blockers
[Any obvious blockers: missing env vars, failed tests, external dependencies not resolved, tasks waiting on another task]
```

Keep the standup under 30 lines. This is a quick sync, not a full status report — use `/project-status` for that.

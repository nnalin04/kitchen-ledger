---
name: task-board
description: Use when someone asks to see the task board, view pending tasks, update a task, mark something done, add a new task, or manage the backlog.
argument-hint: "optional: add | done | pending | section-name"
disable-model-invocation: true
---

## What This Skill Does

Manages the project task board in `PROJECT_TODO.md`. Supports viewing, adding, and marking tasks complete.

The `$ARGUMENTS` determines the mode:
- No argument → show full board with stats
- `done` → mark a task as complete (ask which one)
- `add` → add a new task (ask for details)
- `pending` → show only incomplete tasks, prioritised
- A section name (e.g. `monitoring`) → show only that section

## Steps

### Mode: view (no arguments or section name)

1. Read `PROJECT_TODO.md` in full.
2. For each section, count `[x]` (done) and `[ ]` (pending).
3. Output:

```
# Task Board

## Progress Overview
| Section | Done | Pending | % Complete |
|---------|------|---------|------------|
| 1. Infrastructure | N | N | % |
| ...               |   |   |   |
| **TOTAL**         |   |   |   |

## Pending Tasks by Priority
### 🔴 Launch Blockers (must ship before first user)
- [ ] Section N: [task text] → [Assignee Domain]

### 🟡 Pre-Production (important but not launch-blocking)
- [ ] ...

### 🟢 Operational & Quality
- [ ] ...
```

Classify each pending task into the right priority bucket based on your PM judgement.

### Mode: `done`

1. Read `PROJECT_TODO.md`.
2. List all `[ ]` tasks with numbers.
3. Ask the user: "Which task(s) did you complete? Enter the number(s)."
4. Change `- [ ]` to `- [x]` for the selected tasks using Edit.
5. Confirm: "Marked N task(s) as done."

### Mode: `add`

1. Ask the user:
   - What is the task? (one sentence)
   - Which section does it belong to? (list sections)
   - Is it a launch blocker?
2. Add the task as `- [ ] [task text]` under the correct section using Edit.
3. Confirm: "Added to Section N."

### Mode: `pending`

1. Read `PROJECT_TODO.md`.
2. Extract only `[ ]` items.
3. Sort by section order (infrastructure first, monitoring last).
4. Output as a numbered list with domain assignment and size estimate next to each.

## Notes

- Never delete tasks from `PROJECT_TODO.md` — only mark them `[x]` or add new ones.
- If the user asks to reprioritise, reorder tasks within a section using Edit but do not move between sections unless they explicitly ask.
- After any edit, show the updated section to confirm the change.

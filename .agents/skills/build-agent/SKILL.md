---
name: build-agent
description: Use when a new specialist role is needed that none of the 4 existing agents cover, or when someone wants to add a new type of expert agent to the system.
argument-hint: "role description, e.g. 'database admin' or 'data analyst'"
disable-model-invocation: true
---

## What This Skill Does

Creates a new specialist agent when the existing 4 agents (`reviewer`, `qa-tester`, `security-engineer`, `devops-engineer`) cannot cover a required task. Only creates a new agent if the role represents a genuine conflict or specialist domain — not just domain knowledge that the `reviewer` can handle.

## When NOT to Create a New Agent

Before creating, verify that the new role truly cannot be absorbed by an existing agent:

| Need | Use instead |
|------|-------------|
| Review code in a new tech | Add domain criteria to `reviewer.md` |
| UX review for a new framework | Update `reviewer.md` (UX/Design domain) |
| Test a new feature | `qa-tester` already covers all feature testing |
| New cloud provider | `devops-engineer` handles infra generically |
| New security standard | `security-engineer` handles all security |

**Only create a new agent if** the role has a genuine conflict with an existing agent (e.g., a data scientist who needs to run destructive ML experiments that would conflict with the reviewer's read-only posture).

## Steps

### 1. Validate the need

Check current agents:
```bash
ls .Codex/agents/ | sed 's/\.md//'
```

State which existing agent was considered and why it cannot cover the need.

### 2. Read style reference

Read: `.Codex/agents/reviewer.md` (for style, structure, and Learnings protocol)

### 3. Define the agent

**Frontmatter:**
- `name` — lowercase, hyphenated
- `description` — "Use when someone needs [actions]. This role exists because [conflict reason]."

**Body sections:**
1. **Role & Conflict Reason** — who this agent is and why it can't be merged with an existing agent
2. **Project Context** — specific files, frameworks, conventions for this project
3. **Responsibilities** — 4-6 specific areas
4. **Output Format** — standard report structure
5. **Learnings block** — required at end of every response

### 4. Write the agent file

Write to `.Codex/agents/<agent-name>.md`. Keep under 150 lines.

### 5. Update AGENTS.md

Read `AGENTS.md` and add the new agent to the Agents table.

### 6. Confirm to user

```
## New Agent Created: [agent-name]

**File:** .Codex/agents/[agent-name].md
**Conflict reason:** [why this couldn't use an existing agent]
**Added to:** AGENTS.md

**To invoke:** Ask the PM to use [agent-name] for [domain] tasks.
```

## Notes

- Every agent must end responses with a `## Learnings` block
- Keep agent files under 150 lines — detailed reference goes into supporting files or skills
- After creation, test by describing a task to the PM and verifying correct routing

---
name: retrospective
description: Use when someone wants to run a retrospective, improve the agent system, process accumulated learnings, make agents smarter, or improve skills based on past execution experience.
argument-hint: "optional: agent or skill name to focus on, or 'all'"
disable-model-invocation: true
---

## What This Skill Does

Reads accumulated learnings from `.Codex/memory/learnings.md`, applies improvements to agent and skill files, updates `patterns.md` with recurring insights, and resets the learnings log. Also scans for size-threshold violations and flags candidates for splitting.

This is the **main improvement driver** for the entire system. Run it after 5+ significant tasks, or whenever agents feel imprecise or slow.

---

## Steps

### 1. Read current learnings

Read `.Codex/memory/learnings.md` in full. If it has fewer than 3 entries, tell the user: "Not enough learnings yet to run a meaningful retrospective. Run more tasks first." Stop.

Also read `.Codex/memory/patterns.md` for context on previously established patterns.

### 2. Scan file sizes

Find all oversized files:

```bash
find .Codex/agents .Codex/skills -name "*.md" -exec wc -l {} \; | sort -rn | head -20
```

Flag:
- Any `agents/*.md` over **150 lines**
- Any `skills/*/SKILL.md` over **200 lines**

List them as split candidates at the end of the report.

### 3. Determine scope

If `$ARGUMENTS` names a specific agent or skill, focus only on that. Otherwise process all learnings.

### 4. Spawn project-manager agent to apply improvements

Pass all learnings and size data:

```
You are running a retrospective for the Personal Health Coach agent system.

## Accumulated Learnings
[full contents of .Codex/memory/learnings.md]

## Established Patterns (from previous retrospectives)
[full contents of .Codex/memory/patterns.md]

## Size Violations (files exceeding thresholds)
[list of oversized files from wc output]

## Focus scope
$ARGUMENTS [or "all agents and skills"]

## Your Task

### Phase 1 — Classify learnings
Group all learnings by target (agent name or skill name). Identify:
- Gaps: something the agent/skill was missing and had to improvise
- Improvements: specific additions or rewrites needed
- Patterns: recurring themes across multiple agents/skills
- Split candidates: sections that should become their own sub-skills

### Phase 2 — Apply improvements
For each agent or skill with pending improvements:
1. Read the current file
2. Apply only the changes that are clearly beneficial and well-evidenced by the learnings
3. Keep files within size thresholds — if applying improvements would breach the limit, split instead
4. Write the updated file
5. Add an entry to `.Codex/memory/agent-notes/<name>.md` documenting what was changed and why

### Phase 3 — Update patterns.md
Extract cross-cutting patterns (things that appear in 2+ agents or skills) and add them to `.Codex/memory/patterns.md`. These become permanent conventions.

### Phase 4 — Reset learnings
After applying improvements, clear the processed entries from `learnings.md`. Keep unprocessed entries (anything from today, or anything too vague to act on). Write the updated file.

### Phase 5 — Report
Produce a retrospective report:

## Retrospective Report — [date]

### Applied Improvements
| Target | Change | Evidence |
|--------|--------|----------|
| [agent/skill] | [what changed] | [learning that drove it] |

### New Patterns Added to patterns.md
- [pattern]: [description]

### Split Candidates
| File | Lines | Reason |
|------|-------|--------|
| [path] | N | [why it should split] |
→ Run `/split-skill [name]` to split

### Skipped / Needs More Data
- [learning that was too vague to act on]

### System Health
- Agents: [N total, N improved, N at risk of bloat]
- Skills: [N total, N improved, N at risk of bloat]
- Next retrospective recommended after: [N more tasks]
```

## Notes

- Never delete information from agent/skill files — only add or refine
- A learning like "the agent worked perfectly" is not actionable — skip it
- If an improvement would change the fundamental scope of an agent, flag it for the user to review before applying
- After a retrospective, `/standup` or `/project-status` should feel noticeably more accurate

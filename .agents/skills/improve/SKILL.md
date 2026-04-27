---
name: improve
description: Use when someone wants to improve a specific agent or skill, make an agent smarter, refine an agent's instructions, or update a skill based on how it performed.
argument-hint: "agent or skill name, e.g. 'qa-tester' or 'e2e-test'"
disable-model-invocation: true
---

## What This Skill Does

Performs a targeted improvement of a single agent or skill. Reads the current file, reads its learning notes, checks its size, applies improvements, and optionally triggers a split if the file is oversized.

Unlike `/retrospective` (which processes all accumulated learnings), this is surgical — one file, one improvement session.

---

## Steps

### 1. Identify target

From `$ARGUMENTS`:
- If it names an agent (e.g., `qa-tester`): target is `.Codex/agents/qa-tester.md`
- If it names a skill (e.g., `e2e-test`): target is `.Codex/skills/e2e-test/SKILL.md`
- If ambiguous, check both locations and ask the user which one they mean

Read the target file. If it doesn't exist, tell the user and stop.

### 2. Gather improvement context

Read in parallel:
- The target file (current content)
- Its agent-notes entry: `.Codex/memory/agent-notes/<name>.md`
- Relevant entries from `.Codex/memory/learnings.md` (grep for the name)
- `.Codex/memory/patterns.md` (for system-wide patterns to apply)

Check current line count:
```bash
wc -l [target file path]
```

### 3. Assess the file

Evaluate the target against these criteria:

**For agents:**
- Does it have a clear, single area of ownership?
- Does every responsibility section give actionable, specific instructions?
- Does it include a `## Learnings` output format requirement?
- Is the routing/handoff protocol clear and consistent with other agents?
- Is it under 150 lines? If over → recommend split alongside improvements

**For skills:**
- Does it have a clear scope declaration at the top?
- Does each step tell Codex exactly what to do (no vague "analyse the situation")?
- Does it handle its main failure modes explicitly (service down, file missing, etc.)?
- Does it use `!`command`` for dynamic context where appropriate?
- Is it under 200 lines? If over → recommend split alongside improvements

### 4. Apply improvements

Make targeted edits — do NOT rewrite the entire file unless it is fundamentally broken. Improvements should be:
- **Additive:** add missing context, edge cases, clearer instructions
- **Clarifying:** rewrite vague steps with specific actions
- **Trimming:** remove redundant instructions that repeat other files
- **Pattern-applying:** incorporate patterns from `patterns.md` that aren't yet reflected

Apply using Edit tool (not Write), preserving all content that is already working.

### 5. Add `## Learnings` output block if missing

If the agent/skill does not end with a `## Learnings` section in its output template, add it:

**For agents** — add to the Output Standards section:
```markdown
## Learnings
End every response with this block:
- **Gap:** [anything missing from your instructions you had to improvise]
- **Improvement:** [what should be added to your agent file]
- **Pattern:** [recurring issue across multiple runs]
- **Split:** [section that should become its own sub-skill]
If nothing to report: `## Learnings — nothing to report this run.`
```

**For skills** — add to the Notes section:
```markdown
- At the end of execution, append to `.Codex/memory/learnings.md`:
  `### [date] — [skill-name]`
  followed by any gaps, improvements, or split candidates noticed during this run.
```

### 6. Update agent-notes

Write an entry to `.Codex/memory/agent-notes/<name>.md`:
```
## [date] — Improvement applied
**What changed:** [summary]
**Evidence:** [which learning drove this]
**Before:** [line count before]
**After:** [line count after]
```

### 7. Report

```
## Improvement Complete — [target name]

**File:** [path]
**Lines:** [before] → [after]

### Changes Applied
- [change 1]: [reason]
- [change 2]: [reason]

### Still Pending (needs more data)
- [learning that wasn't actionable yet]

### Size Status
✅ Within limit / ⚠️ Approaching limit (N lines) / ❌ Oversized — run `/split-skill [name]`
```

## Notes

- If no learnings exist for this target yet, assess the file against the criteria in Step 3 alone
- If you're unsure whether to apply a change, describe the change and ask the user before editing
- Never change the frontmatter `name` field — it is the skill's identity and must match the directory name

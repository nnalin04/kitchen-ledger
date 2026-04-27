---
name: split-skill
description: Use when a skill is too large, when a skill does too many things, when context needs to be minimised, or when a skill should be broken into smaller focused sub-skills.
argument-hint: "skill name to split, e.g. 'e2e-test' or 'security-audit'"
disable-model-invocation: true
---

## What This Skill Does

Splits an oversized skill into a lightweight **router** + focused **sub-skills**. The router stays small (≤ 50 lines) and delegates to sub-skills based on `$ARGUMENTS` or task scope. Context stays minimal because only the relevant sub-skill is loaded for any given task.

**When to split:**
- SKILL.md > 200 lines
- Skill has 3+ distinct modes or phases with little overlap
- Execution routinely loads context that isn't needed for the current task

---

## Steps

### 1. Read and analyse the target skill

From `$ARGUMENTS`: the skill name (e.g., `e2e-test`).

Read: `.Codex/skills/$ARGUMENTS/SKILL.md`

Check line count:
```bash
wc -l .Codex/skills/$ARGUMENTS/SKILL.md
```

If under 200 lines and has fewer than 3 distinct phases, tell the user: "This skill is [N] lines and does not appear to need splitting yet. Run `/improve $ARGUMENTS` instead." Stop.

### 2. Identify natural split points

Analyse the skill for natural boundaries. Common patterns:

| Split pattern | Indicator |
|--------------|-----------|
| **Phases** | Numbered phases (Phase 1, Phase 2…) that are independently useful |
| **Modes** | Branching on `$ARGUMENTS` into completely different workflows |
| **Environments** | Different behaviour for dev vs uat vs prod |
| **Scopes** | Different targets (backend vs mobile vs ai-service) |

Identify 2–4 sub-skills. Each sub-skill should:
- Have a single, clear responsibility
- Be invocable independently (not just as part of the parent)
- Be under 100 lines
- Have its own name: `[parent-name]-[sub-task]`

### 3. Design the split

Before creating any files, state the proposed split to the user:

```
## Proposed Split: [skill-name]

Current size: [N] lines

Sub-skills to create:
1. `/[name]-[sub1]` — [what it does, ~N lines]
2. `/[name]-[sub2]` — [what it does, ~N lines]
3. `/[name]-[sub3]` — [what it does, ~N lines]

Router (`/[name]`): [N] lines — determines scope from $ARGUMENTS and delegates.

Proceed with this split?
```

Wait for user confirmation before creating files.

### 4. Create sub-skill directories and files

For each sub-skill:

```bash
mkdir -p .Codex/skills/[sub-skill-name]
```

Write `.Codex/skills/[sub-skill-name]/SKILL.md` with:
- Frontmatter: `name`, `description`, `allowed-tools` (only the tools this sub-skill actually needs)
- Content: only the phases/steps that belong to this sub-skill, extracted from the original
- A `## Learnings` output block at the end (following the global self-reflection protocol)

### 5. Rewrite the parent as a router

Overwrite the original SKILL.md with a lightweight router (≤ 50 lines):

```markdown
---
name: [original-name]
description: [original description — unchanged]
argument-hint: [updated hint reflecting sub-skills]
disable-model-invocation: true
allowed-tools: [minimal — only what the router itself needs]
---

## What This Skill Does

[One sentence.] Delegates to focused sub-skills based on scope.

## Sub-Skills

| Sub-skill | Invoke when |
|-----------|-------------|
| `/[name]-[sub1]` | [condition] |
| `/[name]-[sub2]` | [condition] |
| `/[name]-[sub3]` | [condition] |

## Routing

From `$ARGUMENTS` or task context, determine which sub-skill to invoke:

- If [condition 1] → use `/[name]-[sub1]`
- If [condition 2] → use `/[name]-[sub2]`
- If [condition 3] → use `/[name]-[sub3]`
- If no argument or "all" → invoke all sub-skills in the correct sequence

Invoke the selected sub-skill(s) using the Skill tool with the appropriate arguments.
```

### 6. Update AGENTS.md

In the Skills section of AGENTS.md:
- Replace the single skill entry with entries for the router + each sub-skill
- Format: `- /[name] [args]` — brief description, with sub-skills listed underneath indented

### 7. Update memory

Append to `.Codex/memory/learnings.md`:
```
### [date] — split-skill: [original-name]
- **Split:** [original-name] ([N] lines) split into [sub1], [sub2], [sub3]
- **Reason:** [why it was split]
- **Router size:** [N] lines
```

### 8. Report

```
## Split Complete — [original-name]

Original: [N] lines → Router: [N] lines

Sub-skills created:
- /[name]-[sub1]: [N] lines — [description]
- /[name]-[sub2]: [N] lines — [description]
- /[name]-[sub3]: [N] lines — [description]

Usage unchanged: `/[name]` still works as before (now routes to sub-skills).
Direct invocation: `/[name]-[sub1]` if you only need that phase.
```

## Notes

- Always confirm the proposed split with the user before creating files
- Sub-skills inherit the parent's `disable-model-invocation` setting
- Each sub-skill gets its own `allowed-tools` — only what it actually uses
- The parent router's `allowed-tools` needs only `Skill` (to invoke sub-skills)
- Do not split if the phases share significant shared state — keep them together

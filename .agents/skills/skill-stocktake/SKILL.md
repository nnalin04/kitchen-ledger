---
description: "Use when auditing Codex skills and commands for quality. Supports Quick Scan (changed skills only) and Full Stocktake modes with sequential subagent batch evaluation."
origin: ECC
---

# skill-stocktake

Slash command (`/skill-stocktake`) that audits all Codex skills and commands using a quality checklist + holistic judgment. Two modes: Quick Scan for recently changed skills, Full Stocktake for a complete review.

## Scope

Paths targeted (relative to invocation directory):

| Path | Description |
|------|-------------|
| `~/.Codex/skills/` | Global skills (all projects) |
| `{cwd}/.Codex/skills/` | Project-level skills (if exists) |

At the start of Phase 1, explicitly list which paths were found and scanned.

## Modes

| Mode | Trigger | Duration |
|------|---------|----------|
| Quick Scan | `results.json` exists (default) | 5–10 min |
| Full Stocktake | `results.json` absent, or `/skill-stocktake full` | 20–30 min |

**Results cache:** `~/.Codex/skills/skill-stocktake/results.json`

## Quick Scan Flow

1. Read `~/.Codex/skills/skill-stocktake/results.json`
2. Find skills modified since last run (check file mtimes)
3. If none changed: report "No changes since last run." and stop
4. Re-evaluate only changed files using the same Phase 2 criteria
5. Carry forward unchanged skills from previous results
6. Output only the diff

## Full Stocktake Flow

### Phase 1 — Inventory

Glob all SKILL.md files. Present inventory table:

```
Scanning:
  ✓ ~/.Codex/skills/         (N files)
  ✓/✗ {cwd}/.Codex/skills/  (N files / not found)
```

| Skill | Last Modified | Description |
|-------|---------------|-------------|

### Phase 2 — Quality Evaluation

Use Agent tool subagents, ~20 skills per batch. Each skill evaluated against:

```
- [ ] Content overlap with other skills checked
- [ ] Overlap with MEMORY.md / AGENTS.md checked
- [ ] Freshness of technical references verified
- [ ] Is the skill focused (one pattern per skill)?
```

Verdict criteria:

| Verdict | Meaning |
|---------|---------|
| Keep | Useful and current |
| Improve | Worth keeping, specific improvements needed |
| Update | Referenced technology is outdated |
| Retire | Low quality, stale, or redundant |
| Merge into [X] | Substantial overlap; name the merge target |

**Reason quality requirements:**
- **Retire**: state (1) specific defect, (2) what covers the same need
- **Merge**: name target, describe content to integrate
- **Improve**: describe specific change needed (section, action, target size)

### Phase 3 — Summary Table

| Skill | Verdict | Reason |
|-------|---------|--------|

### Phase 4 — Consolidation

1. **Retire/Merge**: present detailed justification per file before confirming with user
2. **Improve**: present specific improvement suggestions
3. **Update**: present updated content
4. Check MEMORY.md line count; propose compression if >100 lines

## Results File Schema

```json
{
  "evaluated_at": "2026-03-17T10:00:00Z",
  "mode": "full",
  "skills": {
    "skill-name": {
      "path": "~/.Codex/skills/skill-name/SKILL.md",
      "verdict": "Keep",
      "reason": "Concrete, actionable, unique value for X workflow",
      "mtime": "2026-01-15T08:30:00Z"
    }
  }
}
```

## Notes

- Evaluation is blind: same checklist applies to all skills regardless of origin
- Archive/delete operations always require explicit user confirmation

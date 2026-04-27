---
name: continuous-learning-v2
description: Instinct-based learning system. Use /learn or /learn-eval after solving non-trivial problems to extract atomic instincts with confidence scoring. Instincts are project-scoped by default and promoted to global when seen in 2+ projects.
origin: ECC
version: 2.1.0
---

# Continuous Learning v2

An instinct-based learning system where observations from sessions crystallize into atomic skills.

## Architecture

```
Session work
    ↓
/learn or /learn-eval
    ↓
~/.Codex/skills/learned/<pattern-name>.md   (project-scoped if project-specific)
    ↓
/skill-stocktake (periodic audit)
    ↓
Retire / Merge / Promote to .Codex/skills/
```

## Instinct File Format

```markdown
---
name: pattern-name
description: "Under 130 characters — used for matching"
confidence: 0.7          # 0.3 (tentative) to 0.9 (proven)
scope: project|global    # project = only this repo, global = all projects
origin: auto-extracted
extracted: 2026-03-17
project: my-project      # set if scope=project
---

# Pattern Name

## Problem
[Specific problem this solves]

## Solution
[Pattern/technique/workaround with code example]

## When to Use
[Concrete trigger conditions]

## Evidence
[Session(s) where this was validated]
```

## Confidence Scoring

| Score | Meaning |
|-------|---------|
| 0.3–0.4 | Tentative — seen once, may be coincidence |
| 0.5–0.6 | Likely valid — seen twice or clearly generalizable |
| 0.7–0.8 | Confident — consistently useful |
| 0.9 | Proven — battle-tested across multiple projects |

## Scope Decision

**Project-scoped** (`.Codex/skills/learned/` in project root):
- Codebase-specific conventions
- Framework version quirks for this project
- Architecture decisions specific to this codebase

**Global** (`~/.Codex/skills/learned/`):
- Language/framework patterns usable in any project
- Tool usage patterns
- Debugging techniques

**Promotion**: When a project-scoped instinct proves useful in 2+ projects, promote it to global using `/learn-eval` and delete the project-scoped copy.

## Lifecycle Commands

| Command | Action |
|---------|--------|
| `/learn` | Extract pattern from current session, save after user confirmation |
| `/learn-eval` | Extract + quality gate + holistic verdict before saving |
| `/skill-stocktake` | Periodic audit — Keep/Improve/Update/Retire/Merge verdicts |

## Continuous Improvement Cycle

```
Every 5-10 tasks:
1. /learn-eval → extract patterns
2. /skill-stocktake → audit portfolio
3. Promote high-confidence project instincts to global
4. Retire low-value instincts
```

## What NOT to Extract

- Trivial fixes (typos, syntax errors)
- One-time issues (specific API outages, infrastructure incidents)
- Information already in AGENTS.md or memory files
- Git history or recent changes

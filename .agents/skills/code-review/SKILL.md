---
name: code-review
description: Use when someone asks to review code, do a code review, check changes before committing, or audit the current diff for issues.
argument-hint: "optional: HEAD~N or branch name to diff against"
disable-model-invocation: true
---

## What This Skill Does

Spawns the `reviewer` agent on changed files. The reviewer auto-detects which domains are touched (backend / mobile / AI service / UX / architecture / performance / testing) and runs focused passes only for relevant domains, then returns one consolidated prioritised report.

## Steps

### 1. Get the diff

If `$ARGUMENTS` is provided, use it as the base ref:
```bash
git diff $ARGUMENTS
git diff $ARGUMENTS --name-only
```

Otherwise default to all uncommitted changes:
```bash
git diff HEAD
git diff HEAD --name-only
```

If the working tree is clean, check the latest commit:
```bash
git diff HEAD~1
```
and inform the user which commit is being reviewed.

### 2. Spawn reviewer agent

Pass the full diff and changed file list:

```
You are performing a code review for this project.
(Infer the project name from AGENTS.md, git remote URL, or package.json/pom.xml if available.)

## Changed Files
[git diff --name-only output]

## Diff
[full git diff output]

## Instructions
Follow your Review Process:
1. Detect which domains are touched from the changed files.
2. Run a focused review pass for each relevant domain.
3. Aggregate findings, deduplicate, sort by severity.
4. Output your full structured Review Report.
```

### 3. Present results

Show the full reviewer report. If there are zero Critical and zero High issues, explicitly confirm the changes look good to merge.

## Notes

- Do not modify any files — this is a read-only review skill.
- If the diff is > 500 files, warn the user and suggest narrowing scope with a specific ref or file path.
- If only one layer changed (e.g. only `.dart` files), the reviewer will skip irrelevant domain passes automatically.

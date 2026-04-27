---
name: ui-review
description: Use when someone wants to review the UI, check the design of a screen, verify accessibility, check if the app looks good, audit the visual design, or ensure Material Design 3 compliance.
argument-hint: "optional: screen name or feature, e.g. 'dashboard' or 'medical-upload'"
disable-model-invocation: true
---

## What This Skill Does

Spawns the `reviewer` agent with UX/Design + Mobile domains activated to review Flutter screens for Material Design 3 compliance, accessibility, UX quality, and design consistency.

## Steps

### 1. Determine scope

If `$ARGUMENTS` is a screen or feature name, focus there. Otherwise review all recently changed screens.

**Get changed Dart files:**
!`git diff HEAD --name-only | grep "\.dart$" | grep "features/"`

**If no argument and no changed files, get all feature screens:**
!`find mobile/lib/features -name "*.dart" | grep -v "_test" | sort`

**Get the theme definition:**
!`cat mobile/lib/core/theme/app_theme.dart`

### 2. Read the relevant screen files

Read each screen file in scope. Collect all content to pass to the reviewer.

### 3. Spawn reviewer agent

```
You are performing a UX and design review for the Personal Health Coach Flutter app.

## Scope
$ARGUMENTS [or "All recently changed screens" if no argument]

## Activate Domains
- UX/Design (Material Design 3, accessibility, design consistency)
- Mobile (Flutter widget correctness, Riverpod usage, navigation)
Do NOT run Backend, AI Service, or other unrelated domains.

## Theme / Design System
[app_theme.dart content]

## Screen Files to Review
[For each screen: filename + full content]

## Instructions
Follow your Review Process for UX/Design and Mobile domains only.
Output your full structured Review Report.
```

### 4. Present results

Show the full reviewer report. If issues require code changes, list the files and fixes clearly for the developer to action.

## Notes

- Accessibility issues (missing labels, contrast failures, tap targets < 44dp) are always High or Critical.
- If `$ARGUMENTS` contains a direct file path, read that file directly.
- Do not modify any files — this is a read-only review skill.

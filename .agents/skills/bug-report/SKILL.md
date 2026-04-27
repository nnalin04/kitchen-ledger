---
name: bug-report
description: Use when someone wants to report a bug, document an issue, file a defect, or describe something that is broken or not working as expected.
argument-hint: "optional: brief bug title"
disable-model-invocation: true
---

## What This Skill Does

Guides the user through documenting a bug in a structured format. Asks targeted questions, then produces a complete bug report that can be added to the project backlog or shared with the team.

## Steps

### 1. Gather bug information

Ask the user these questions (one round — ask all at once using AskUserQuestion):

- **What is broken?** Describe the problem in one sentence.
- **Where did it happen?** Backend API / AI Service / Mobile App / E2E Flow
- **How severe is it?** Critical (app unusable) / High (major feature broken) / Medium (workaround exists) / Low (cosmetic)
- **Steps to reproduce** — what did you do before seeing the problem?
- **Expected result** — what should have happened?
- **Actual result** — what actually happened? (include error messages or screenshots if you have them)

If the user provided a title in `$ARGUMENTS`, use it as the bug title — don't ask again.

### 2. Search for relevant code

Based on the component they identified, search for relevant files:

- Backend: `Grep` for related controller/service names in `backend/src/`
- AI Service: `Grep` for related router/service in `ai-service/app/`
- Mobile: `Glob` for the relevant feature screen in `mobile/lib/features/`

Include the file paths in the bug report so the developer knows where to look.

### 3. Check git log for recent changes

```bash
git log --oneline --since="7 days ago" -- [relevant directory]
```

If there's a recent commit touching the affected area, note it as a potential cause.

### 4. Produce the bug report

```
# Bug Report

**Title:** [title from $ARGUMENTS or user input]
**Date:** [today]
**Severity:** [Critical / High / Medium / Low]
**Status:** Open
**Component:** [Backend / AI Service / Mobile / E2E]
**Environment:** [Local / Dev / UAT / Prod]

---

## Summary
[One sentence description of the problem]

## Steps to Reproduce
1. [step]
2. [step]
3. ...

## Expected Result
[What should have happened]

## Actual Result
[What actually happened — include error messages verbatim]

## Relevant Files
- [file path found from code search]

## Recent Changes in This Area
[From git log — any commits in the last 7 days touching these files]

## Possible Cause
[Your analysis based on the code and recent changes. If unclear, write "Unknown — investigation needed."]

## Suggested Fix
[If cause is known, describe the fix. Otherwise, note what to investigate first.]

---
*Reported via /bug-report skill*
```

### 5. Ask how to save it

Ask: "Save this bug report to `plans/bugs/[title-slug].md`? Or copy it to clipboard only?"

If saving: write the file to `plans/bugs/` using the title as a kebab-case filename.

## Notes

- If the user says it's a Critical or High severity bug in auth, medical data, or AI insights, flag it explicitly: "⚠️ This affects a security or health-critical feature — prioritise immediately."
- Do not attempt to fix the bug — only document it. Fixing belongs in a separate task.

---
name: release-notes
description: Use when someone asks to generate release notes, changelog, what changed in this release, or summarise commits for a version.
argument-hint: "tag or ref range, e.g. v1.0.0..HEAD or HEAD~20"
---

## Task

Generate professional release notes for the Personal Health Coach system from git history.

## Context to gather

**Commit range:**
If `$ARGUMENTS` is provided, use it as the git ref range:
!`git log $ARGUMENTS --oneline --no-merges`

Otherwise use all commits since the last tag, or last 30 commits if no tags exist:
!`git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~30")..HEAD --oneline --no-merges`

**Full commit details for categorisation:**
!`git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~30")..HEAD --pretty=format:"%h %s" --no-merges`

**Files changed:**
!`git diff $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~30")..HEAD --name-only`

## Release notes to produce

Categorise each commit into one of these buckets based on the commit message and files changed:

| Category | Emoji | What counts |
|----------|-------|------------|
| New Features | ✨ | New endpoints, new screens, new AI capabilities |
| Improvements | 🔧 | Enhancements to existing features, UX polish |
| Bug Fixes | 🐛 | Fixes to broken behaviour |
| Security | 🔒 | Auth, JWT, input validation, rate limiting |
| Infrastructure | 🏗️ | Docker, GCP, deploy scripts, env config |
| Testing | 🧪 | New or improved tests |
| Dependencies | 📦 | Package/library updates |
| Breaking Changes | ⚠️ | API changes that require client updates |

**Output format:**

```
# Release Notes — [version or date range]
**Generated:** [today's date]
**Commits:** [count] | **Files changed:** [count]

---

## ⚠️ Breaking Changes
[List only if any — be explicit about what callers must change]

## ✨ New Features
- **[Area]:** [What it does and why it matters]

## 🔧 Improvements
- **[Area]:** [What improved]

## 🐛 Bug Fixes
- **[Area]:** [What was broken, what's fixed]

## 🔒 Security
- [Security improvement]

## 🏗️ Infrastructure
- [Infra change]

## 🧪 Testing
- [Test additions]

---
*Commits included: [short SHA list]*
```

If a commit doesn't fit any category clearly, skip it — don't force bad categorisation.
Group multiple small commits in the same area into a single bullet point.

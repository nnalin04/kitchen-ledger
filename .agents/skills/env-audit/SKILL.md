---
name: env-audit
description: Use when someone wants to audit environment variables, check if env files are complete, verify secrets are set, or compare env configs across environments.
argument-hint: "optional: dev | uat | prod | all"
---

## Task

Audit environment variable files across all environments for the Personal Health Coach system.

## Context to gather

**Required keys (must exist and be non-empty in every env):**
- `JWT_SECRET`
- `POSTGRES_PASSWORD`
- `GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `SPRING_DATASOURCE_URL`
- `SPRING_DATASOURCE_USERNAME`
- `AI_BASE_URL`

**Env files present:**
!`ls -la env.* 2>/dev/null || echo "No env files found"`

**Keys present in each env file (values masked):**
!`grep -h "^[A-Z_]*=" env.dev 2>/dev/null | sed 's/=.*/=<SET>/' | sort || echo "env.dev: not found"`
!`grep -h "^[A-Z_]*=" env.uat 2>/dev/null | sed 's/=.*/=<SET>/' | sort || echo "env.uat: not found"`
!`grep -h "^[A-Z_]*=" env.prod 2>/dev/null | sed 's/=.*/=<SET>/' | sort || echo "env.prod: not found"`

**Check for empty values or placeholders:**
!`grep -h "=$\|=your_\|=changeme\|=secret\|=CHANGE_ME\|=placeholder" env.dev env.uat env.prod 2>/dev/null | sed 's/=.*/=<EMPTY OR PLACEHOLDER>/' || echo "None found"`

**Diff between dev and prod structure (keys only):**
!`diff <(grep -o "^[A-Z_]*" env.dev 2>/dev/null | sort) <(grep -o "^[A-Z_]*" env.prod 2>/dev/null | sort) || true`

## Audit to produce

Using the context above:

### 1. Completeness Check

For each environment, list which required keys are:
- ✅ Present and set
- ❌ Missing entirely
- ⚠️ Empty or placeholder value

```
| Key | dev | uat | prod |
|-----|-----|-----|------|
| JWT_SECRET | ✅ | ✅ | ❌ Missing |
| ...
```

### 2. Security Flags

- Flag any value that appears to be a placeholder (`your_*`, `changeme`, empty)
- Flag if `AI_BASE_URL` uses `localhost` in non-local environments (should be service name or internal DNS)
- Flag if `JWT_SECRET` appears to be short (< 32 chars — infer from value length if visible, or flag if placeholder)
- Flag any key that exists in dev but not in prod (prod might be missing a required setting)

### 3. Recommendations

List specific actions:
```
## Actions Required

### 🔴 Critical (blocks deployment)
1. prod: Set JWT_SECRET — currently missing
2. ...

### 🟡 Warning (should fix)
1. uat: AI_BASE_URL uses localhost — change to internal service name
2. ...

### 🟢 All clear
- [keys that are properly configured everywhere]
```

Do NOT print the actual secret values anywhere in the output — only confirm they are set, empty, or missing.
